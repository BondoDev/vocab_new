import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateInitializer, evaluateModule, effectCalls, evaluate, ts } from "./component-contract.mjs";

const featureRoot = new URL("../../src/features/user-profile/sections/my-lists/", import.meta.url);

export function loadListHelper(fileName, exportName, bindings = {}) {
  const source = fs.readFileSync(new URL(fileName, featureRoot), "utf8");
  const exported = evaluateModule(source, bindings)[exportName];
  assert.equal(typeof exported, "function", `expected function ${exportName}`);
  return exported;
}

export function assertDetailMembershipSearch(detailSource) {
  const useMemo = (callback) => callback();
  const vocabulary = [
    { conceptId: "unstudied", targetWord: "Birne", translation: "Pear" },
    { conceptId: "known", targetWord: "Apfel", translation: "Apple" },
    { conceptId: "foreign", targetWord: "Birne", translation: "Pear" },
  ];
  const resolveListWordStatus = loadListHelper("listWordStatus.ts", "resolveListWordStatus", {
    mapWordStateToVocabularyCategory: loadListHelper("../../../../data/learning/vocabularyCategory.ts", "mapWordStateToVocabularyCategory"),
  });
  const allRows = evaluateInitializer(detailSource, "allRows", {
    useMemo, resolveState: { status: "ready", rows: vocabulary },
    wordStateByConceptId: new Map([["known", "familiar"]]), resolveListWordStatus,
  });
  const memberships = [
    { wordId: "unstudied", createdAt: "2026-08-12" },
    { wordId: "known", createdAt: "2026-08-10" },
  ];
  const addedAtByConceptId = evaluateInitializer(detailSource, "addedAtByConceptId", { useMemo, memberships });
  const listRows = evaluateInitializer(detailSource, "listRows", { useMemo, allRows, addedAtByConceptId });
  assert.deepEqual(listRows.map((row) => row.conceptId), ["unstudied", "known"]);
  assert.deepEqual(listRows.map((row) => row.status), ["notStudied", "known"]);
  const filterListWordRowsBySearch = loadListHelper("listWordFiltering.ts", "filterListWordRowsBySearch");
  const search = (searchQuery, sortMode = "recentlyAdded") => evaluateInitializer(detailSource, "filteredRows", {
    useMemo, listRows, searchQuery, sortMode, filterListWordRowsBySearch,
  });
  for (const query of [" BIRNE ", " PEAR "]) {
    assert.deepEqual(search(query).map((row) => row.conceptId), ["unstudied"]);
  }
  assert.deepEqual(search("missing"), []);
  assert.deepEqual(search("").map((row) => row.conceptId), ["unstudied", "known"]);
  assert.deepEqual(search("", "nameAsc").map((row) => row.targetWord), ["Apfel", "Birne"]);
  assert.deepEqual(listRows.map((row) => row.conceptId), ["unstudied", "known"], "sorting must not mutate memberships");
}

export function assertDetailPagination(detailSource) {
  const PAGE_SIZE = evaluateInitializer(detailSource, "PAGE_SIZE");
  assert.equal(PAGE_SIZE, 10);
  const filteredRows = Array.from({ length: 23 }, (_, index) => ({ conceptId: String(index) }));
  function pageRows(page, rows = filteredRows) {
    const totalPages = evaluateInitializer(detailSource, "totalPages", { filteredRows: rows, PAGE_SIZE });
    const clampedPage = evaluateInitializer(detailSource, "clampedPage", { page, totalPages });
    const pageStart = evaluateInitializer(detailSource, "pageStart", { clampedPage, PAGE_SIZE });
    return evaluateInitializer(detailSource, "pagedRows", { filteredRows: rows, pageStart, PAGE_SIZE });
  }
  assert.deepEqual(pageRows(2), filteredRows.slice(10, 20));
  assert.deepEqual(pageRows(99), filteredRows.slice(20));
  assert.deepEqual(pageRows(3, filteredRows.slice(0, 4)), filteredRows.slice(0, 4));
  assert.deepEqual(pageRows(1, []), []);
  const getPageWindow = loadListHelper("listPagination.ts", "getPageWindow");
  assert.deepEqual(evaluateInitializer(detailSource, "pageWindow", { clampedPage: 1, totalPages: 9, getPageWindow }), [1, 2, 3]);
  assert.deepEqual(evaluateInitializer(detailSource, "pageWindow", { clampedPage: 9, totalPages: 9, getPageWindow }), [7, 8, 9]);
  const resetEffects = effectCalls(detailSource).filter((call) => {
    const dependencies = call.arguments[1];
    return ts.isArrayLiteralExpression(dependencies) &&
      dependencies.elements.map((element) => element.getText()).join(",") === "searchQuery,sortMode";
  });
  assert.equal(resetEffects.length, 1, "search/sort changes must reset pagination");
  const updates = [];
  evaluate(resetEffects[0].arguments[0], { setPage: (page) => updates.push(page) })();
  assert.deepEqual(updates, [1]);
}
