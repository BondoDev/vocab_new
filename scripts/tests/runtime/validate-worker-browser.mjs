import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const DESKTOP_URL = mustEnv("DESKTOP_URL");
const MOBILE_URL = mustEnv("MOBILE_URL");
const OUTPUT_DIR = path.resolve(process.cwd(), process.env.OUTPUT_DIR ?? "artifacts/browser-validation");
const VALIDATION_LABEL = process.env.VALIDATION_LABEL ?? "browser";
const CHECK_HEADER_INTERACTIONS = process.env.CHECK_HEADER_INTERACTIONS !== "false";
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const ALLOWED_EXTERNAL_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const INITIAL_HYDRATION_FORBIDDEN = [/\/assets\/vocabulary-[^/]+\.js/i];

function mustEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findBrowserExecutable() {
  const explicit = process.env.BROWSER_EXECUTABLE;
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("No Chrome/Edge executable found");
}

async function waitForJson(url, timeoutMs = 20000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`Unexpected status ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

class CDPClient {
  constructor(websocketUrl) {
    this.ws = new WebSocket(websocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data.toString());
      if (payload.id) {
        const pending = this.pending.get(payload.id);
        if (!pending) return;
        this.pending.delete(payload.id);
        if (payload.error) {
          pending.reject(new Error(payload.error.message));
        } else {
          pending.resolve(payload.result);
        }
        return;
      }
      const handlers = this.eventHandlers.get(payload.method);
      if (!handlers) return;
      for (const handler of handlers) {
        handler(payload.params ?? {});
      }
    });
  }

  async connect() {
    await this.ready;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
  }

  async close() {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
      await delay(100);
    }
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value;
}

async function waitForReadyState(client, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await evaluate(client, "document.readyState")) === "complete") {
      return;
    }
    await delay(200);
  }
  throw new Error("Timed out waiting for document.readyState=complete");
}

async function waitForCondition(client, expression, timeoutMs = 10000, pollMs = 150) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, expression)) {
      return true;
    }
    await delay(pollMs);
  }
  return false;
}

async function click(client, selector) {
  return evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      element.click();
      return true;
    })()`,
  );
}

async function clickByText(client, selector, expectedText) {
  return evaluate(
    client,
    `(() => {
      const elements = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const element = elements.find((node) => (node.textContent || "").trim() === ${JSON.stringify(expectedText)});
      if (!element) return false;
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      element.click();
      return true;
    })()`,
  );
}

async function typeInto(client, selector, value) {
  return evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (!setter) return false;
      setter.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
}

async function pressKey(client, selector, key) {
  return evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.focus();
      const eventInit = { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true };
      element.dispatchEvent(new KeyboardEvent("keydown", eventInit));
      element.dispatchEvent(new KeyboardEvent("keypress", eventInit));
      element.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      return true;
    })()`,
  );
}

async function setViewport(client, { width, height, mobile }) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function captureScreenshot(client, outputPath) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(outputPath, Buffer.from(result.data, "base64"));
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [String(key).toLowerCase(), String(value)]),
  );
}

function summarizeRequests(requests) {
  return requests.map((entry) => ({
    url: entry.url,
    type: entry.type,
    status: entry.status,
    mimeType: entry.mimeType,
  }));
}

function analyzeRequests(requests, pageUrl) {
  const baseHost = new URL(pageUrl).host;
  const unexpected = [];
  const hydrationForbidden = [];
  for (const request of requests) {
    if (!request.url) continue;
    if (request.url.startsWith("data:")) continue;
    const requestUrl = new URL(request.url);
    if (
      requestUrl.host !== baseHost &&
      !ALLOWED_EXTERNAL_HOSTS.has(requestUrl.host)
    ) {
      unexpected.push(request.url);
    }
    if (INITIAL_HYDRATION_FORBIDDEN.some((pattern) => pattern.test(request.url))) {
      hydrationForbidden.push(request.url);
    }
  }
  return { unexpected, hydrationForbidden };
}

function matchesStatus(message, keywords) {
  const normalized = String(message ?? "").toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function hasHydrationIssue(consoleMessages, exceptions) {
  return (
    consoleMessages.some((entry) =>
      /hydration|did not match|recoverable hydration error|minified react error/i.test(entry.text),
    ) ||
    exceptions.some((entry) => /hydration|did not match|minified react error/i.test(entry))
  );
}

function buildRecorder() {
  const state = {
    current: null,
  };

  return {
    start(name) {
      state.current = {
        name,
        consoleMessages: [],
        exceptions: [],
        requests: [],
        responseHeaders: [],
        requestById: new Map(),
      };
      return state.current;
    },
    stop() {
      const done = state.current;
      state.current = null;
      return done;
    },
    attach(client) {
      client.on("Runtime.consoleAPICalled", (params) => {
        if (!state.current) return;
        state.current.consoleMessages.push({
          type: params.type,
          text: (params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" "),
        });
      });
      client.on("Runtime.exceptionThrown", (params) => {
        if (!state.current) return;
        state.current.exceptions.push(params.exceptionDetails?.text ?? "Unknown exception");
      });
      client.on("Log.entryAdded", (params) => {
        if (!state.current) return;
        const entry = params.entry ?? {};
        state.current.consoleMessages.push({
          type: entry.level ?? "log",
          text: entry.text ?? "",
        });
      });
      client.on("Network.requestWillBeSent", (params) => {
        if (!state.current) return;
        state.current.requestById.set(params.requestId, {
          url: params.request?.url ?? "",
          type: params.type ?? "",
        });
      });
      client.on("Network.responseReceived", (params) => {
        if (!state.current) return;
        const started = state.current.requestById.get(params.requestId) ?? {};
        const entry = {
          url: params.response?.url ?? started.url ?? "",
          type: params.type ?? started.type ?? "",
          status: params.response?.status ?? 0,
          mimeType: params.response?.mimeType ?? "",
          headers: normalizeHeaders(params.response?.headers ?? {}),
        };
        state.current.requests.push(entry);
        if (params.type === "Document") {
          state.current.responseHeaders.push({
            url: entry.url,
            status: entry.status,
            headers: entry.headers,
          });
        }
      });
    },
  };
}

async function collectPageState(client) {
  return evaluate(
    client,
    `(() => {
      const jsonLdHosts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .flatMap((node) => {
          try {
            const parsed = JSON.parse(node.textContent || "null");
            const items = Array.isArray(parsed) ? parsed : [parsed];
            const urls = [];
            const visit = (value) => {
              if (!value || typeof value !== "object") return;
              for (const entry of Object.values(value)) {
                if (typeof entry === "string" && /^https?:\\/\\//i.test(entry)) {
                  urls.push(entry);
                } else if (Array.isArray(entry)) {
                  entry.forEach(visit);
                } else if (entry && typeof entry === "object") {
                  visit(entry);
                }
              }
            };
            items.forEach(visit);
            return urls.map((url) => {
              try {
                return new URL(url).host;
              } catch {
                return null;
              }
            }).filter(Boolean);
          } catch {
            return [];
          }
        });
      return {
        path: location.pathname,
        href: location.href,
        title: document.title,
        headerExists: Boolean(document.querySelector(".header-shell")),
        desktopNavVisible: Boolean(document.querySelector(".header-desktop-nav")),
        loginButtonVisible: Array.from(document.querySelectorAll("button")).some((btn) => (btn.textContent || "").includes("Log in")),
        loginDialogOpen: Boolean(document.querySelector('[data-slot="dialog-content"]')),
        mobileMenuToggle: Boolean(document.querySelector(".header-menu-toggle")),
        mobileMenuOpen: document.querySelector(".header-mobile-menu")?.classList.contains("is-open") ?? false,
        languageSwitcherVisible: Boolean(document.querySelector(".ui-language-switcher-trigger")),
        languageDropdownOpen: Boolean(document.querySelector(".ui-language-dropdown")),
        rootChildren: document.querySelector("#root")?.children.length ?? 0,
        hasHydrationMarkers: Array.from(document.querySelectorAll("[data-reactroot], [data-react-checksum]")).length,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
        robotsMeta: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
        ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? null,
        hreflangHrefs: Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map((node) => node.getAttribute("href")).filter(Boolean),
        jsonLdHosts,
        wordLemma: window.__WORD_PAGE_DATA__?.data?.wordEntry?.wordLemma ?? null,
        practiceInputAriaLabel: document.querySelector('input[aria-label]')?.getAttribute("aria-label") ?? null,
        speechEvents: window.__browserValidation?.speechEvents ?? [],
      };
    })()`,
  );
}

async function runPracticeFlow(client, expectedWord, mode) {
  const selector = 'input[aria-label]';
  const initial = await typeInto(client, selector, "");
  if (!initial) {
    return { supported: false };
  }
  const wrongAnswer = `${expectedWord}x`;
  await typeInto(client, selector, wrongAnswer);
  await clickByText(client, "button", mode.checkLabel);
  const incorrectVisible = await waitForCondition(
    client,
    `(() => {
      return Array.from(document.querySelectorAll("span")).some((node) => {
        const className = typeof node.className === "string" ? node.className : "";
        return className.includes("text-red-500");
      });
    })()`,
  );

  await typeInto(client, selector, expectedWord.slice(0, Math.max(expectedWord.length - 1, 1)));
  const retryResetClearsError = await waitForCondition(
    client,
    `(() => {
      return !Array.from(document.querySelectorAll("span")).some((node) => {
        const className = typeof node.className === "string" ? node.className : "";
        return className.includes("text-red-500");
      });
    })()`,
  );

  await typeInto(client, selector, expectedWord);
  await pressKey(client, selector, "Enter");
  const enterSubmitWorks = await waitForCondition(
    client,
    `(() => {
      return Array.from(document.querySelectorAll("span")).some((node) => {
        const className = typeof node.className === "string" ? node.className : "";
        return className.includes("text-green-600");
      });
    })()`,
  );

  await typeInto(client, selector, `${expectedWord} `);
  const resetClearsSuccess = await waitForCondition(
    client,
    `(() => {
      return !Array.from(document.querySelectorAll("span")).some((node) => {
        const className = typeof node.className === "string" ? node.className : "";
        return className.includes("text-green-600");
      });
    })()`,
  );

  await typeInto(client, selector, expectedWord);
  await clickByText(client, "button", mode.checkLabel);
  const clickSubmitWorks = await waitForCondition(
    client,
    `(() => {
      return Array.from(document.querySelectorAll("span")).some((node) => {
        const className = typeof node.className === "string" ? node.className : "";
        return className.includes("text-green-600");
      });
    })()`,
  );

  return {
    supported: true,
    incorrectVisible,
    retryResetClearsError,
    enterSubmitWorks,
    resetClearsSuccess,
    clickSubmitWorks,
  };
}

function getPracticeKeywords(url) {
  const lang = new URL(url).pathname.split("/").filter(Boolean)[0] ?? "en";
  const keywordMap = {
    en: {
      checkLabel: "Check Answer",
      correctKeywords: ["correct"],
      incorrectKeywords: ["try again", "incorrect"],
    },
    es: {
      checkLabel: "Comprobar respuesta",
      correctKeywords: ["correcto"],
      incorrectKeywords: ["intentalo de nuevo", "intentalo de nuevo"],
    },
    fr: {
      checkLabel: "Verifier la reponse",
      correctKeywords: ["correct"],
      incorrectKeywords: ["reessayez"],
    },
    de: {
      checkLabel: "Antwort prufen",
      correctKeywords: ["richtig"],
      incorrectKeywords: ["nochmal versuchen"],
    },
    it: {
      checkLabel: "Controlla risposta",
      correctKeywords: ["corretto"],
      incorrectKeywords: ["riprova"],
    },
    pt: {
      checkLabel: "Verificar resposta",
      correctKeywords: ["correto"],
      incorrectKeywords: ["tente novamente"],
    },
    ru: {
      checkLabel: "Проверить ответ",
      correctKeywords: ["верно"],
      incorrectKeywords: ["неверно"],
    },
  };
  const resolved = keywordMap[lang] ?? keywordMap.en;
  return {
    checkLabel: resolved.checkLabel,
    correctKeywords: resolved.correctKeywords.map((value) => value.toLowerCase()),
    incorrectKeywords: resolved.incorrectKeywords.map((value) => value.toLowerCase()),
  };
}

async function resolveCheckLabel(client, fallback) {
  const buttonText = await evaluate(
    client,
    `(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const match = buttons.find((btn) => /answer|respuesta|reponse|antwort|risposta|ответ/i.test(btn.textContent || ""));
      return match?.textContent?.trim() ?? null;
    })()`,
  );
  return buttonText ?? fallback;
}

async function runWordScenario(client, recorder, scenario) {
  const capture = recorder.start(scenario.name);
  await setViewport(client, scenario.viewport);
  await client.send("Page.navigate", { url: scenario.url });
  await waitForReadyState(client);
  await delay(1500);

  const initialState = await collectPageState(client);
  const initialRequests = summarizeRequests(capture.requests);
  const initialRequestAnalysis = analyzeRequests(capture.requests, scenario.url);
  const initialDocument = capture.responseHeaders[0] ?? null;

  await click(client, "main section button[aria-label]");
  await delay(250);
  const pronunciationState = await collectPageState(client);

  const practiceKeywords = getPracticeKeywords(scenario.url);
  practiceKeywords.checkLabel = (await resolveCheckLabel(client, practiceKeywords.checkLabel)) ?? practiceKeywords.checkLabel;
  const practice = await runPracticeFlow(client, initialState.wordLemma ?? "", practiceKeywords);
  await delay(500);

  let headerState = null;
  if (CHECK_HEADER_INTERACTIONS) {
    if (scenario.viewport.mobile) {
      await click(client, ".header-menu-toggle");
      await delay(400);
      await click(client, ".header-mobile-lang-wrap .ui-language-switcher-trigger");
      await delay(400);
      headerState = await collectPageState(client);
    } else {
      await click(client, ".ui-language-switcher-trigger");
      await delay(400);
      const loginClicked = await clickByText(client, "button", "Log in");
      if (loginClicked) {
        await delay(400);
      }
      headerState = await collectPageState(client);
    }
  }

  await captureScreenshot(client, path.join(OUTPUT_DIR, `${scenario.name}.png`));
  const finalState = await collectPageState(client);
  const done = recorder.stop();

  return {
    initialState,
    initialRequests,
    initialDocument,
    initialRequestAnalysis,
    pronunciation: {
      clicked: pronunciationState.speechEvents.length > 0,
      speechEvents: pronunciationState.speechEvents,
    },
    headerState,
    practice,
    finalState,
    consoleMessages: done.consoleMessages,
    exceptions: done.exceptions,
    hydrationIssuesDetected: hasHydrationIssue(done.consoleMessages, done.exceptions),
    requestSummary: summarizeRequests(done.requests),
    responseHeaders: done.responseHeaders,
  };
}

function summarizePassFail(report) {
  const scenarios = [report.desktop, report.mobile];
  const practiceOk = scenarios.every(
    (scenario) =>
      scenario.practice.supported &&
      scenario.practice.incorrectVisible &&
      scenario.practice.retryResetClearsError &&
      scenario.practice.clickSubmitWorks &&
      scenario.practice.resetClearsSuccess,
  );
  const enterOk = report.desktop.practice.enterSubmitWorks === true;
  const consoleOk = scenarios.every(
    (scenario) => scenario.consoleMessages.length === 0 && scenario.exceptions.length === 0 && !scenario.hydrationIssuesDetected,
  );
  const networkOk = scenarios.every(
    (scenario) =>
      scenario.initialRequestAnalysis.unexpected.length === 0 &&
      scenario.initialRequestAnalysis.hydrationForbidden.length === 0,
  );
  return {
    practiceOk,
    enterOk,
    consoleOk,
    networkOk,
  };
}

async function main() {
  ensureDir(OUTPUT_DIR);
  const browserPath = findBrowserExecutable();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-browser-"));
  const port = 9222;
  const browser = spawn(
    browserPath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error("No page target available from the local browser");
    }

    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Log.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          const state = { speechEvents: [] };
          const synth = window.speechSynthesis || {};
          const originalSpeak = synth.speak ? synth.speak.bind(synth) : null;
          const originalCancel = synth.cancel ? synth.cancel.bind(synth) : null;
          const patched = {
            speak(utterance) {
              state.speechEvents.push({
                text: utterance?.text || "",
                lang: utterance?.lang || "",
              });
              if (originalSpeak) {
                try { originalSpeak(utterance); } catch {}
              }
            },
            cancel() {
              if (originalCancel) {
                try { originalCancel(); } catch {}
              }
            },
          };
          Object.defineProperty(window, "speechSynthesis", {
            configurable: true,
            value: Object.assign({}, synth, patched),
          });
          window.__browserValidation = state;
        })();
      `,
    });

    const recorder = buildRecorder();
    recorder.attach(client);

    const desktop = await runWordScenario(client, recorder, {
      name: "desktop",
      url: DESKTOP_URL,
      viewport: { width: 1366, height: 900, mobile: false },
    });
    const mobile = await runWordScenario(client, recorder, {
      name: "mobile",
      url: MOBILE_URL,
      viewport: { width: 390, height: 844, mobile: true },
    });

    const report = {
      generatedAt: new Date().toISOString(),
      label: VALIDATION_LABEL,
      browserPath,
      desktop,
      mobile,
      summary: summarizePassFail({ desktop, mobile }),
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2));
    await client.close();
    console.log(`Browser validation report written to ${path.join(OUTPUT_DIR, "report.json")}`);
  } finally {
    browser.kill("SIGKILL");
    await delay(1000);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
