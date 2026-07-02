import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";

export interface EnglishVerbListFaqItem {
  question: string;
  answer: string;
}

export interface EnglishVerbListContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  heroSubtitle: string;
  introParagraphs: string[];
  stats: {
    verbs: string;
    language: string;
    level: string;
    practice: string;
  };
  sections: {
    statsHeading: string;
    verbListHeading: string;
    learningTipsHeading: string;
    relatedLinksHeading: string;
    faqHeading: string;
  };
  buttons: {
    startPractice: string;
    takeLevelTest: string;
  };
  filters: {
    searchPlaceholder: string;
    cefrLabel: string;
    allLevels: string;
  };
  table: {
    number: string;
    verb: string;
    definition: string;
    wordPage: string;
    noResults: string;
  };
  learningTips: string[];
  relatedLinks: {
    levelTest: string;
    englishA1: string;
    englishA2: string;
    englishB1: string;
    seoHub: string;
  };
  faq: EnglishVerbListFaqItem[];
}

const ENGLISH_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-english-verbs",
  es: "/es/100-verbos-ingles-mas-comunes",
  de: "/de/100-haeufigste-englische-verben",
  fr: "/fr/100-verbes-anglais-les-plus-courants",
  it: "/it/100-verbi-inglesi-piu-comuni",
  pt: "/pt/100-verbos-ingleses-mais-comuns",
  ru: "/ru/100-samykh-chastykh-angliiskikh-glagolov",
};

const ENGLISH_VERB_LIST_CONTENT: Record<UiLanguageCode, EnglishVerbListContent> = {
  en: {
    title: "100 Most Common English Verbs",
    metaTitle: "100 Most Common English Verbs - Essential Verb List",
    metaDescription:
      "Learn the 100 most common English verbs with CEFR levels. Study essential English verbs and practice vocabulary used in everyday communication.",
    heroSubtitle:
      "Learn the essential English verbs used most often in everyday speaking, writing, reading, and listening.",
    introParagraphs: [
      "Verbs are one of the most important parts of English vocabulary. They describe actions, states, habits, thoughts, and communication. By learning the most common English verbs first, you can understand more sentences and express basic ideas more clearly.",
      "This list contains 100 frequently used English verbs selected for practical vocabulary learning. These verbs appear often in everyday conversations, simple texts, instructions, stories, and learning materials.",
      "Use this page as a starting point for English vocabulary practice. Review the verbs, check their CEFR level, open individual word pages, and practice them regularly until they become familiar.",
    ],
    stats: {
      verbs: "100 verbs",
      language: "English vocabulary",
      level: "CEFR-based levels",
      practice: "Practice available",
    },
    sections: {
      statsHeading: "Quick Summary",
      verbListHeading: "100 Common English Verbs List",
      learningTipsHeading: "How to Learn These English Verbs",
      relatedLinksHeading: "Related English Vocabulary Pages",
      faqHeading: "Common Questions About English Verbs",
    },
    buttons: {
      startPractice: "Start English Practice",
      takeLevelTest: "Take English Level Test",
    },
    filters: {
      searchPlaceholder: "Search English verbs...",
      cefrLabel: "CEFR filter",
      allLevels: "All levels",
    },
    table: {
      number: "Number",
      verb: "Verb",
      definition: "Definition",
      wordPage: "Translation",
      noResults: "No verbs match the current filters.",
    },
    learningTips: [
      "Start with 10 verbs per day instead of trying to memorize the full list at once.",
      "Practice each verb in short example sentences, not only as an isolated word.",
      "Review verbs you forget more often and repeat easier verbs less frequently.",
      "Combine verbs with common nouns, adjectives, and prepositions to build useful phrases.",
      "Use the verbs in speaking or writing practice so they become active vocabulary.",
    ],
    relatedLinks: {
      levelTest: "English Level Test",
      englishA1: "English A1 Vocabulary",
      englishA2: "English A2 Vocabulary",
      englishB1: "English B1 Vocabulary",
      seoHub: "Browse all SEO pages",
    },
    faq: [
      {
        question: "What are the most common English verbs?",
        answer:
          "The most common English verbs are verbs that appear very often in everyday communication, such as be, have, do, go, make, know, think, take, see, and come. Learning them helps you understand and create many basic English sentences.",
      },
      {
        question: "Why should I learn common English verbs first?",
        answer:
          "Common verbs are useful because they appear in many different situations. If you learn them early, you can understand more conversations and texts, even before you know thousands of less frequent words.",
      },
      {
        question: "Are these verbs enough for beginners?",
        answer:
          "These 100 verbs are not the whole English language, but they are a strong foundation. Beginners can use them to build simple sentences and understand many everyday expressions.",
      },
      {
        question: "How can I practice these English verbs?",
        answer:
          "You can practice by reading the list, opening individual word pages, creating example sentences, reviewing difficult verbs, and using vocabulary exercises regularly.",
      },
      {
        question: "What CEFR level are these English verbs?",
        answer:
          "Many common English verbs are A1 or A2 because they are essential for basic communication. Some verbs may belong to higher levels depending on their meaning, usage, or difficulty.",
      },
    ],
  },
  es: {
    title: "100 verbos ingleses mas comunes",
    metaTitle: "100 verbos ingleses mas comunes - lista esencial",
    metaDescription:
      "Aprende los 100 verbos ingleses mas comunes con niveles CEFR. Estudia verbos esenciales del ingles y practica vocabulario usado cada dia.",
    heroSubtitle:
      "Aprende los verbos ingleses esenciales que aparecen con mas frecuencia al hablar, escribir, leer y escuchar.",
    introParagraphs: [
      "Los verbos son una parte central del vocabulario ingles. Expresan acciones, estados, habitos, ideas y formas de comunicacion. Si aprendes primero los verbos mas frecuentes, entiendes mas frases y puedes expresarte con mas claridad desde el inicio.",
      "Esta lista reune 100 verbos ingleses de uso muy frecuente seleccionados para un aprendizaje practico. Aparecen una y otra vez en conversaciones cotidianas, textos sencillos, instrucciones, historias y materiales de estudio.",
      "Usa esta pagina como punto de partida para practicar vocabulario ingles. Revisa los verbos, mira su nivel CEFR, abre cada pagina de palabra y vuelvelos a practicar hasta que te resulten naturales.",
    ],
    stats: {
      verbs: "100 verbos",
      language: "Vocabulario de ingles",
      level: "Niveles basados en CEFR",
      practice: "Practica disponible",
    },
    sections: {
      statsHeading: "Resumen rapido",
      verbListHeading: "Lista de 100 verbos ingleses comunes",
      learningTipsHeading: "Como aprender estos verbos ingleses",
      relatedLinksHeading: "Paginas relacionadas de vocabulario ingles",
      faqHeading: "Preguntas comunes sobre los verbos ingleses",
    },
    buttons: {
      startPractice: "Empezar practica de ingles",
      takeLevelTest: "Hacer test de nivel de ingles",
    },
    filters: {
      searchPlaceholder: "Buscar verbos ingleses...",
      cefrLabel: "Filtro CEFR",
      allLevels: "Todos los niveles",
    },
    table: {
      number: "Numero",
      verb: "Verb",
      definition: "Definicion",
      wordPage: "Translation",
      noResults: "Ningun verbo coincide con los filtros actuales.",
    },
    learningTips: [
      "Empieza con 10 verbos al dia en lugar de intentar memorizar toda la lista de una vez.",
      "Practica cada verbo dentro de frases cortas y no solo como palabra aislada.",
      "Repasa con mas frecuencia los verbos que olvidas y deja mas espacio para los faciles.",
      "Combina los verbos con sustantivos, adjetivos y preposiciones comunes para formar expresiones utiles.",
      "Usa estos verbos al hablar o escribir para convertirlos en vocabulario activo.",
    ],
    relatedLinks: {
      levelTest: "Test de nivel de ingles",
      englishA1: "Vocabulario de ingles A1",
      englishA2: "Vocabulario de ingles A2",
      englishB1: "Vocabulario de ingles B1",
      seoHub: "Ver todas las paginas SEO",
    },
    faq: [
      {
        question: "Cuales son los verbos ingleses mas comunes?",
        answer:
          "Son los verbos que aparecen con mucha frecuencia en la comunicacion diaria, como be, have, do, go, make, know, think, take, see y come. Aprenderlos te ayuda a entender y crear muchas frases basicas.",
      },
      {
        question: "Por que conviene aprender primero los verbos comunes?",
        answer:
          "Porque aparecen en muchisimas situaciones. Si los aprendes pronto, puedes comprender mas conversaciones y textos incluso antes de conocer miles de palabras menos frecuentes.",
      },
      {
        question: "Estos 100 verbos son suficientes para principiantes?",
        answer:
          "No representan todo el ingles, pero si una base muy solida. Con ellos, un principiante puede formar frases simples y comprender muchas expresiones cotidianas.",
      },
      {
        question: "Como puedo practicar estos verbos ingleses?",
        answer:
          "Puedes leer la lista, abrir las paginas individuales de cada palabra, escribir frases de ejemplo, repasar los verbos dificiles y usar ejercicios de vocabulario con regularidad.",
      },
      {
        question: "Que nivel CEFR tienen estos verbos?",
        answer:
          "Muchos de los verbos mas comunes son A1 o A2 porque son esenciales para la comunicacion basica. Otros pueden aparecer en niveles mas altos segun su uso, significado o dificultad.",
      },
    ],
  },
  de: {
    title: "100 haufigste englische Verben",
    metaTitle: "100 haufigste englische Verben - unverzichtbare Verb-Liste",
    metaDescription:
      "Lerne die 100 haufigsten englischen Verben mit CEFR-Niveaus. Studiere zentrale englische Verben und ube Wortschatz fur den Alltag.",
    heroSubtitle:
      "Lerne die wichtigsten englischen Verben, die im Alltag beim Sprechen, Schreiben, Lesen und Horen besonders oft vorkommen.",
    introParagraphs: [
      "Verben gehoren zu den wichtigsten Teilen des englischen Wortschatzes. Sie beschreiben Handlungen, Zustande, Gewohnheiten, Gedanken und Kommunikation. Wenn du zuerst die haufigsten englischen Verben lernst, verstehst du schneller mehr Satze und kannst eigene Aussagen klarer formulieren.",
      "Diese Liste enthalt 100 sehr gebrauchliche englische Verben fur praxisnahes Lernen. Sie tauchen regelmassig in alltaglichen Gesprachen, einfachen Texten, Anleitungen, Geschichten und Lernmaterialien auf.",
      "Nutze diese Seite als Startpunkt fur dein englisches Vokabeltraining. Sieh dir die Verben an, prufe ihr CEFR-Niveau, offne einzelne Wortseiten und wiederhole sie so oft, bis sie sicher sitzen.",
    ],
    stats: {
      verbs: "100 Verben",
      language: "Englischer Wortschatz",
      level: "CEFR-basierte Niveaus",
      practice: "Praxis verfugbar",
    },
    sections: {
      statsHeading: "Schnelluberblick",
      verbListHeading: "Liste mit 100 haufigen englischen Verben",
      learningTipsHeading: "So lernst du diese englischen Verben",
      relatedLinksHeading: "Verwandte Seiten zum englischen Wortschatz",
      faqHeading: "Haufige Fragen zu englischen Verben",
    },
    buttons: {
      startPractice: "Englisch uben",
      takeLevelTest: "Englisch-Niveautest machen",
    },
    filters: {
      searchPlaceholder: "Englische Verben suchen...",
      cefrLabel: "CEFR-Filter",
      allLevels: "Alle Niveaus",
    },
    table: {
      number: "Nummer",
      verb: "Verb",
      definition: "Bedeutung",
      wordPage: "Translation",
      noResults: "Keine Verben passen zu den aktuellen Filtern.",
    },
    learningTips: [
      "Lerne lieber 10 Verben pro Tag, statt die ganze Liste auf einmal auswendig zu konnen.",
      "Ube jedes Verb in kurzen Beispielsatzen und nicht nur als einzelnes Wort.",
      "Wiederhole schwierige Verben haufiger und gib einfachen Verben etwas mehr Abstand.",
      "Kombiniere die Verben mit haufigen Nomen, Adjektiven und Prapositionen, um nutzliche Wendungen zu bilden.",
      "Verwende die Verben aktiv beim Sprechen oder Schreiben, damit sie zu echtem Wortschatz werden.",
    ],
    relatedLinks: {
      levelTest: "Englisch-Niveautest",
      englishA1: "Englisch A1 Wortschatz",
      englishA2: "Englisch A2 Wortschatz",
      englishB1: "Englisch B1 Wortschatz",
      seoHub: "Alle SEO-Seiten ansehen",
    },
    faq: [
      {
        question: "Welche englischen Verben sind am haufigsten?",
        answer:
          "Das sind Verben, die in der taglichen Kommunikation sehr oft vorkommen, zum Beispiel be, have, do, go, make, know, think, take, see und come. Wenn du sie lernst, kannst du viele grundlegende englische Satze besser verstehen und bilden.",
      },
      {
        question: "Warum sollte ich zuerst haufige englische Verben lernen?",
        answer:
          "Weil sie in vielen unterschiedlichen Situationen gebraucht werden. Wenn du sie fruh beherrschst, verstehst du mehr Gesprachssituationen und Texte, auch wenn dein Wortschatz noch nicht sehr gross ist.",
      },
      {
        question: "Reichen diese 100 Verben fur Anfanger aus?",
        answer:
          "Sie ersetzen nicht die ganze Sprache, bilden aber ein starkes Fundament. Anfanger konnen mit ihnen einfache Satze bauen und viele alltagliche Ausdruck besser verstehen.",
      },
      {
        question: "Wie kann ich diese englischen Verben uben?",
        answer:
          "Lies die Liste, offne die einzelnen Wortseiten, schreibe Beispielsatze, wiederhole schwierige Verben und arbeite regelmassig mit Vokabelubungen.",
      },
      {
        question: "Welches CEFR-Niveau haben diese Verben?",
        answer:
          "Viele besonders haufige Verben liegen auf A1 oder A2, weil sie fur grundlegende Kommunikation unverzichtbar sind. Manche gehoren je nach Bedeutung oder Gebrauch zu hoheren Niveaus.",
      },
    ],
  },
  fr: {
    title: "100 verbes anglais les plus courants",
    metaTitle: "100 verbes anglais les plus courants - liste essentielle",
    metaDescription:
      "Apprenez les 100 verbes anglais les plus courants avec leurs niveaux CEFR. Etudiez les verbes essentiels de l anglais et pratiquez le vocabulaire du quotidien.",
    heroSubtitle:
      "Apprenez les verbes anglais essentiels que l on rencontre le plus souvent a l oral, a l ecrit, en lecture et en comprehension.",
    introParagraphs: [
      "Les verbes font partie des elements les plus importants du vocabulaire anglais. Ils expriment des actions, des etats, des habitudes, des idees et la communication. En commencant par les verbes les plus frequents, vous comprenez plus vite davantage de phrases et vous exprimez des idees simples avec plus de precision.",
      "Cette liste rassemble 100 verbes anglais tres frequents choisis pour un apprentissage utile et concret. Ils apparaissent souvent dans les conversations quotidiennes, les textes simples, les consignes, les histoires et les supports d apprentissage.",
      "Utilisez cette page comme point de depart pour votre pratique du vocabulaire anglais. Relisez les verbes, verifiez leur niveau CEFR, ouvrez les pages de mots et revenez-y regulierement jusqu a ce qu ils deviennent familiers.",
    ],
    stats: {
      verbs: "100 verbes",
      language: "Vocabulaire anglais",
      level: "Niveaux bases sur le CEFR",
      practice: "Pratique disponible",
    },
    sections: {
      statsHeading: "Resume rapide",
      verbListHeading: "Liste de 100 verbes anglais courants",
      learningTipsHeading: "Comment apprendre ces verbes anglais",
      relatedLinksHeading: "Pages associees au vocabulaire anglais",
      faqHeading: "Questions frequentes sur les verbes anglais",
    },
    buttons: {
      startPractice: "Commencer la pratique de l anglais",
      takeLevelTest: "Passer le test de niveau d anglais",
    },
    filters: {
      searchPlaceholder: "Rechercher des verbes anglais...",
      cefrLabel: "Filtre CEFR",
      allLevels: "Tous les niveaux",
    },
    table: {
      number: "Numero",
      verb: "Verb",
      definition: "Definition",
      wordPage: "Translation",
      noResults: "Aucun verbe ne correspond aux filtres actuels.",
    },
    learningTips: [
      "Travaillez 10 verbes par jour au lieu d essayer de memoriser toute la liste en une fois.",
      "Pratiquez chaque verbe dans de petites phrases d exemple et pas seulement comme mot isole.",
      "Revoyez plus souvent les verbes que vous oubliez et espacez davantage les plus faciles.",
      "Associez les verbes a des noms, adjectifs et prepositions courants pour former des expressions utiles.",
      "Utilisez ces verbes a l oral ou a l ecrit pour qu ils deviennent du vocabulaire actif.",
    ],
    relatedLinks: {
      levelTest: "Test de niveau d anglais",
      englishA1: "Vocabulaire anglais A1",
      englishA2: "Vocabulaire anglais A2",
      englishB1: "Vocabulaire anglais B1",
      seoHub: "Voir toutes les pages SEO",
    },
    faq: [
      {
        question: "Quels sont les verbes anglais les plus courants ?",
        answer:
          "Ce sont les verbes qui apparaissent tres souvent dans la communication quotidienne, comme be, have, do, go, make, know, think, take, see et come. Les apprendre aide a comprendre et produire de nombreuses phrases simples.",
      },
      {
        question: "Pourquoi apprendre d abord les verbes courants ?",
        answer:
          "Parce qu ils sont utiles dans de nombreuses situations. Si vous les maitrisez tot, vous comprenez plus de conversations et de textes, meme avec un vocabulaire encore limite.",
      },
      {
        question: "Ces 100 verbes suffisent-ils pour un debutant ?",
        answer:
          "Ils ne representent pas toute la langue anglaise, mais ils constituent une base solide. Un debutant peut s en servir pour construire des phrases simples et comprendre de nombreuses expressions du quotidien.",
      },
      {
        question: "Comment puis-je pratiquer ces verbes anglais ?",
        answer:
          "Vous pouvez lire la liste, ouvrir les pages individuelles des mots, inventer des phrases d exemple, revoir les verbes difficiles et utiliser regulierement des exercices de vocabulaire.",
      },
      {
        question: "A quels niveaux CEFR appartiennent ces verbes ?",
        answer:
          "Beaucoup de verbes tres frequents sont A1 ou A2 car ils sont essentiels a la communication de base. D autres peuvent relever de niveaux plus eleves selon leur usage, leur sens ou leur difficulte.",
      },
    ],
  },
  it: {
    title: "100 verbi inglesi piu comuni",
    metaTitle: "100 verbi inglesi piu comuni - lista essenziale",
    metaDescription:
      "Impara i 100 verbi inglesi piu comuni con livelli CEFR. Studia i verbi essenziali dell inglese e pratica il vocabolario usato ogni giorno.",
    heroSubtitle:
      "Impara i verbi inglesi essenziali che compaiono piu spesso nel parlato, nella scrittura, nella lettura e nell ascolto.",
    introParagraphs: [
      "I verbi sono una delle parti piu importanti del vocabolario inglese. Esprimono azioni, stati, abitudini, pensieri e comunicazione. Se impari prima i verbi piu frequenti, capisci piu frasi e riesci a esprimere idee di base in modo piu chiaro.",
      "Questa lista contiene 100 verbi inglesi di uso molto frequente scelti per uno studio pratico del vocabolario. Compaiono spesso in conversazioni quotidiane, testi semplici, istruzioni, storie e materiali didattici.",
      "Usa questa pagina come punto di partenza per praticare il vocabolario inglese. Rivedi i verbi, controlla il loro livello CEFR, apri le singole pagine parola e allenati con regolarita finche non ti diventano familiari.",
    ],
    stats: {
      verbs: "100 verbi",
      language: "Vocabolario inglese",
      level: "Livelli basati sul CEFR",
      practice: "Pratica disponibile",
    },
    sections: {
      statsHeading: "Riepilogo rapido",
      verbListHeading: "Lista di 100 verbi inglesi comuni",
      learningTipsHeading: "Come imparare questi verbi inglesi",
      relatedLinksHeading: "Pagine correlate di vocabolario inglese",
      faqHeading: "Domande comuni sui verbi inglesi",
    },
    buttons: {
      startPractice: "Inizia pratica di inglese",
      takeLevelTest: "Fai il test di livello di inglese",
    },
    filters: {
      searchPlaceholder: "Cerca verbi inglesi...",
      cefrLabel: "Filtro CEFR",
      allLevels: "Tutti i livelli",
    },
    table: {
      number: "Numero",
      verb: "Verb",
      definition: "Definizione",
      wordPage: "Translation",
      noResults: "Nessun verbo corrisponde ai filtri attuali.",
    },
    learningTips: [
      "Parti da 10 verbi al giorno invece di cercare di memorizzare tutta la lista in una volta sola.",
      "Pratica ogni verbo in frasi brevi di esempio e non solo come parola isolata.",
      "Ripassa piu spesso i verbi che dimentichi e meno spesso quelli gia facili.",
      "Combina i verbi con nomi, aggettivi e preposizioni comuni per creare espressioni utili.",
      "Usa questi verbi nel parlato o nella scrittura per trasformarli in vocabolario attivo.",
    ],
    relatedLinks: {
      levelTest: "Test di livello di inglese",
      englishA1: "Vocabolario inglese A1",
      englishA2: "Vocabolario inglese A2",
      englishB1: "Vocabolario inglese B1",
      seoHub: "Vedi tutte le pagine SEO",
    },
    faq: [
      {
        question: "Quali sono i verbi inglesi piu comuni?",
        answer:
          "Sono i verbi che compaiono molto spesso nella comunicazione quotidiana, come be, have, do, go, make, know, think, take, see e come. Impararli aiuta a capire e costruire molte frasi inglesi di base.",
      },
      {
        question: "Perche dovrei imparare prima i verbi comuni?",
        answer:
          "Perche sono utili in moltissime situazioni. Se li impari presto, capisci meglio conversazioni e testi anche prima di conoscere migliaia di parole meno frequenti.",
      },
      {
        question: "Questi 100 verbi bastano per un principiante?",
        answer:
          "Non rappresentano tutta la lingua inglese, ma sono una base molto forte. Un principiante puo usarli per costruire frasi semplici e capire molte espressioni quotidiane.",
      },
      {
        question: "Come posso praticare questi verbi inglesi?",
        answer:
          "Puoi leggere la lista, aprire le singole pagine parola, creare frasi di esempio, ripassare i verbi difficili e usare con regolarita esercizi di vocabolario.",
      },
      {
        question: "A quale livello CEFR appartengono questi verbi?",
        answer:
          "Molti verbi molto comuni sono A1 o A2 perche sono essenziali per la comunicazione di base. Alcuni possono appartenere a livelli piu alti a seconda del significato, dell uso o della difficolta.",
      },
    ],
  },
  pt: {
    title: "100 verbos ingleses mais comuns",
    metaTitle: "100 verbos ingleses mais comuns - lista essencial",
    metaDescription:
      "Aprenda os 100 verbos ingleses mais comuns com niveis CEFR. Estude verbos essenciais do ingles e pratique vocabulario usado na comunicacao do dia a dia.",
    heroSubtitle:
      "Aprenda os verbos ingleses essenciais que aparecem com mais frequencia na fala, na escrita, na leitura e na escuta.",
    introParagraphs: [
      "Os verbos sao uma das partes mais importantes do vocabulario em ingles. Eles expressam acoes, estados, habitos, pensamentos e comunicacao. Ao aprender primeiro os verbos mais comuns, voce entende mais frases e consegue expressar ideias basicas com mais clareza.",
      "Esta lista traz 100 verbos ingleses muito frequentes selecionados para um estudo pratico de vocabulario. Eles aparecem com frequencia em conversas do dia a dia, textos simples, instrucoes, historias e materiais de aprendizagem.",
      "Use esta pagina como ponto de partida para praticar vocabulario em ingles. Revise os verbos, confira o nivel CEFR, abra as paginas individuais das palavras e pratique com regularidade ate que eles se tornem familiares.",
    ],
    stats: {
      verbs: "100 verbos",
      language: "Vocabulario de ingles",
      level: "Niveis baseados no CEFR",
      practice: "Pratica disponivel",
    },
    sections: {
      statsHeading: "Resumo rapido",
      verbListHeading: "Lista de 100 verbos ingleses comuns",
      learningTipsHeading: "Como aprender estes verbos ingleses",
      relatedLinksHeading: "Paginas relacionadas de vocabulario em ingles",
      faqHeading: "Perguntas comuns sobre verbos ingleses",
    },
    buttons: {
      startPractice: "Comecar pratica de ingles",
      takeLevelTest: "Fazer teste de nivel de ingles",
    },
    filters: {
      searchPlaceholder: "Pesquisar verbos ingleses...",
      cefrLabel: "Filtro CEFR",
      allLevels: "Todos os niveis",
    },
    table: {
      number: "Numero",
      verb: "Verb",
      definition: "Definicao",
      wordPage: "Translation",
      noResults: "Nenhum verbo corresponde aos filtros atuais.",
    },
    learningTips: [
      "Comece com 10 verbos por dia em vez de tentar memorizar a lista inteira de uma vez.",
      "Pratique cada verbo em frases curtas de exemplo, e nao apenas como palavra isolada.",
      "Revise com mais frequencia os verbos que voce esquece e com menos frequencia os mais faceis.",
      "Combine os verbos com substantivos, adjetivos e preposicoes comuns para formar expressoes uteis.",
      "Use os verbos na fala ou na escrita para que eles se tornem vocabulario ativo.",
    ],
    relatedLinks: {
      levelTest: "Teste de nivel de ingles",
      englishA1: "Vocabulario de ingles A1",
      englishA2: "Vocabulario de ingles A2",
      englishB1: "Vocabulario de ingles B1",
      seoHub: "Ver todas as paginas SEO",
    },
    faq: [
      {
        question: "Quais sao os verbos ingleses mais comuns?",
        answer:
          "Sao os verbos que aparecem com muita frequencia na comunicacao diaria, como be, have, do, go, make, know, think, take, see e come. Aprender esses verbos ajuda voce a entender e montar muitas frases basicas em ingles.",
      },
      {
        question: "Por que devo aprender primeiro os verbos mais comuns?",
        answer:
          "Porque eles sao uteis em muitas situacoes diferentes. Se voce os aprende cedo, consegue entender mais conversas e textos mesmo antes de conhecer milhares de palavras menos frequentes.",
      },
      {
        question: "Estes 100 verbos sao suficientes para iniciantes?",
        answer:
          "Eles nao representam toda a lingua inglesa, mas formam uma base muito forte. Iniciantes podem usalos para montar frases simples e compreender muitas expressoes do cotidiano.",
      },
      {
        question: "Como posso praticar estes verbos ingleses?",
        answer:
          "Voce pode ler a lista, abrir as paginas individuais das palavras, criar frases de exemplo, revisar os verbos mais dificeis e usar exercicios de vocabulario com regularidade.",
      },
      {
        question: "Qual e o nivel CEFR destes verbos ingleses?",
        answer:
          "Muitos verbos muito comuns sao A1 ou A2 porque sao essenciais para a comunicacao basica. Alguns podem pertencer a niveis mais altos dependendo do significado, do uso ou da dificuldade.",
      },
    ],
  },
  ru: {
    title: "100 samykh chastykh angliiskikh glagolov",
    metaTitle: "100 samykh chastykh angliiskikh glagolov - bazovyi spisok",
    metaDescription:
      "Izuchai 100 samykh chastykh angliiskikh glagolov s urovnyami CEFR. Osvaivai bazovye glagoly angliiskogo yazyka i praktikui slovarnyi zapas dlya ezhednevnogo obshcheniya.",
    heroSubtitle:
      "Izuchai osnovnye angliiskie glagoly, kotorye chashche vsego vstrechayutsya v razgovore, chtenii, pisme i vospriyatii na slukh.",
    introParagraphs: [
      "Glagoly - odna iz samykh vazhnykh chastei angliiskogo slovarnogo zapasa. Oni opisyvayut deistviya, sostoyaniya, privychki, mysli i obshchenie. Esli nachat s samykh upotrebitelnykh glagolov, budet prosche ponimat bolshe predlozhenii i vyrazhat bazovye mysli bolee tochno.",
      "V etom spiske sobrany 100 chasto upotreblyaemykh angliiskikh glagolov dlya praktichnogo izucheniya slov. Oni regulyarno vstrechayutsya v povsednevnykh dialogakh, prostykh tekstakh, instruktsiyakh, rasskazakh i uchebnykh materialakh.",
      "Ispolzui etu stranicu kak startovuyu tochku dlya praktiki angliiskoi leksiki. Prosmatrivai glagoly, proveriai ikh uroven CEFR, otkryvai stranitsy otdelnykh slov i vozvrashchaisya k nim regulyarno, poka oni ne stanut znakomymi.",
    ],
    stats: {
      verbs: "100 glagolov",
      language: "Angliiskii slovarnyi zapas",
      level: "Urovni po CEFR",
      practice: "Praktika dostupna",
    },
    sections: {
      statsHeading: "Kratkoe rezume",
      verbListHeading: "Spisok iz 100 rasprostranennykh angliiskikh glagolov",
      learningTipsHeading: "Kak uchit eti angliiskie glagoly",
      relatedLinksHeading: "Svyazannye stranitsy po angliiskoi leksike",
      faqHeading: "Chastye voprosy ob angliiskikh glagolakh",
    },
    buttons: {
      startPractice: "Nachat praktiku angliiskogo",
      takeLevelTest: "Proiti test po angliiskomu",
    },
    filters: {
      searchPlaceholder: "Poisk angliiskikh glagolov...",
      cefrLabel: "Filtr CEFR",
      allLevels: "Vse urovni",
    },
    table: {
      number: "Nomer",
      verb: "Verb",
      definition: "Znachenie",
      wordPage: "Translation",
      noResults: "Po tekushchim filtrom nichego ne naideno.",
    },
    learningTips: [
      "Luchshe uchit po 10 glagolov v den, a ne pytatsya zapomnit ves spisok srazu.",
      "Praktikui kazhdyi glagol v korotkikh primerakh, a ne tolko kak otdelnoe slovo.",
      "Chashche povtoryai glagoly, kotorye zabyvayutsya, i rezhche - te, chto uzhe legko dautsya.",
      "Soedinyai glagoly s chasto upotreblyaemymi sushchestvitelnymi, prilagatelnymi i predlogami, chtoby sobirat poleznye frazy.",
      "Ispolzui eti glagoly v ustnoi ili pisemennoi praktike, chtoby oni stali aktivnoi leksikoi.",
    ],
    relatedLinks: {
      levelTest: "Test po angliiskomu",
      englishA1: "Angliiskaia leksika A1",
      englishA2: "Angliiskaia leksika A2",
      englishB1: "Angliiskaia leksika B1",
      seoHub: "Posmotret vse SEO-stranitsy",
    },
    faq: [
      {
        question: "Kakie angliiskie glagoly samye chastye?",
        answer:
          "Eto glagoly, kotorye ochen chasto vstrechayutsya v povsednevnom obshchenii, naprimer be, have, do, go, make, know, think, take, see i come. Izuchenie takikh glagolov pomogaet ponimat i stroit mnogie bazovye angliiskie predlozheniya.",
      },
      {
        question: "Pochemu stoit nachinat s chastykh glagolov?",
        answer:
          "Potomu chto oni nuzhny v samykh raznykh situatsiyakh. Esli vyuchit ikh ranshe, budet prosche ponimat bolshe razgovorov i tekstov dazhe bez ogromnogo zapasa redkikh slov.",
      },
      {
        question: "Khvatit li etikh 100 glagolov nachinayushchemu?",
        answer:
          "Eto ne ves angliiskii yazyk, no ochen silnaya osnova. Nachinayushchie mogut ispolzovat eti glagoly dlya prostykh predlozhenii i ponimaniya mnogikh povsednevnykh vyrazhenii.",
      },
      {
        question: "Kak mozhno praktikovat eti angliiskie glagoly?",
        answer:
          "Chitai spisok, otkryvai stranitsy otdelnykh slov, pridumyvai svoi primery, povtoryai slozhnye glagoly i regulyarno zanimaisya cherez uprazhneniya na slovarnyi zapas.",
      },
      {
        question: "Kakogo urovnya CEFR eti glagoly?",
        answer:
          "Mnogie iz samykh upotrebimykh glagolov otnosyatsya k A1 ili A2, potomu chto oni neobkhodimy dlya bazovogo obshcheniya. Chast glagolov mozhet otnosit'sya k bolee vysokim urovnyam v zavisimosti ot znacheniya, upotrebleniya ili slozhnosti.",
      },
    ],
  },
};

export function getEnglishVerbListPath(uiLang: UiLanguageCode): string {
  return ENGLISH_VERB_LIST_PATHS[uiLang];
}

export function resolveEnglishVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(ENGLISH_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllEnglishVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => ENGLISH_VERB_LIST_PATHS[uiLang]);
}

export function getEnglishVerbListContent(uiLang: UiLanguageCode): EnglishVerbListContent {
  return ENGLISH_VERB_LIST_CONTENT[uiLang] ?? ENGLISH_VERB_LIST_CONTENT.en;
}
