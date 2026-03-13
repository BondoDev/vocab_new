import { buildLocalizedVocabularyPath, type TargetLanguageSlug, type UiLanguageCode } from "../seo/slugs";

export interface LevelTestContentSection {
  heading: string;
  paragraphs: string[];
}

export interface LevelTestContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  introParagraphs: string[];
  sections: LevelTestContentSection[];
  practiceLinksHeading: string;
  startButtonLabel: string;
}

const LEVEL_TEST_PATHS: Partial<
  Record<UiLanguageCode, Partial<Record<TargetLanguageSlug, string>>>
> = {
  en: {
    english: "/en/english-level-test",
  },
  es: {
    english: "/es/test-de-nivel-de-ingles",
  },
  fr: {
    english: "/fr/test-de-niveau-d-anglais",
  },
  de: {
    english: "/de/englisch-niveau-test",
  },
  it: {
    english: "/it/test-di-livello-di-inglese",
  },
  pt: {
    english: "/pt/teste-de-nivel-de-ingles",
  },
  ru: {
    english: "/ru/test-urovnya-angliiskogo",
  },
};

const ENGLISH_UI_ENGLISH_LEVEL_TEST: LevelTestContent = {
  title: "English Level Test",
  metaTitle: "English Level Test – Check Your CEFR Level (A1–C2)",
  metaDescription:
    "Take the English level test and discover your CEFR level from A1 to C2. Find your vocabulary level and start practicing English words that match your ability.",
  introParagraphs: [
    "The English Level Test helps you discover your current English proficiency according to the CEFR language scale from A1 to C2. By taking the test, you can quickly understand how well you recognize and understand English vocabulary used in everyday communication.",
    "Knowing your level is an important step in language learning. Many learners study materials that are either too easy or too difficult, which slows down progress. This English level test helps identify the vocabulary range you already know and the level that best represents your current ability.",
    "Once you know your CEFR level, you can begin practicing English vocabulary that matches your knowledge. Learning words appropriate to your level helps build confidence, improves comprehension, and supports steady progress toward higher proficiency.",
  ],
  sections: [
    {
      heading: "What Is the English Level Test?",
      paragraphs: [
        "The English Level Test helps you discover your current English proficiency according to the CEFR language scale from A1 to C2. By taking the test, you can quickly understand how well you recognize and understand English vocabulary used in everyday communication.",
        "Knowing your level is an important step in language learning. Many learners study materials that are either too easy or too difficult, which slows down progress. This English level test helps identify the vocabulary range you already know and the level that best represents your current ability.",
        "Once you know your CEFR level, you can begin practicing English vocabulary that matches your knowledge. Learning words appropriate to your level helps build confidence, improves comprehension, and supports steady progress toward higher proficiency.",
      ],
    },
    {
      heading: "How to Test Your English Level",
      paragraphs: [
        "Testing your English level is a simple way to evaluate your current vocabulary knowledge. The test is designed to estimate which CEFR level best reflects your ability to recognize and understand common English words used in real communication.",
        "The CEFR system divides language proficiency into six levels, from beginner to highly proficient. These levels are used internationally to describe language ability in a clear and consistent way. By identifying your level, you gain a better understanding of your current vocabulary capacity.",
        "After discovering your level, you can focus on practicing vocabulary designed for that stage. This targeted learning approach allows you to improve more efficiently, expanding your vocabulary step by step while strengthening your overall language skills.",
      ],
    },
    {
      heading: "CEFR Language Levels Explained",
      paragraphs: [
        "A1 – Beginner: At the A1 level, learners understand and use very basic English words and expressions related to everyday situations. Vocabulary includes simple greetings, common objects, numbers, and basic actions used in familiar contexts.",
        "A2 – Elementary: A2 learners can understand frequently used vocabulary connected with daily activities such as shopping, travel, family, and work. Communication is still simple but more flexible than at the beginner stage.",
        "B1 – Intermediate: At the B1 level, learners can understand common English vocabulary used in conversations, media, and everyday texts. They can communicate about experiences, plans, opinions, and familiar topics with reasonable clarity.",
        "B2 – Upper Intermediate: B2 learners possess a broad vocabulary that allows them to understand complex texts and participate actively in discussions. They can express ideas clearly and understand a wide range of topics in spoken and written English.",
        "C1 – Advanced: At the C1 level, learners understand sophisticated vocabulary and complex language structures. They can follow demanding texts, express ideas fluently, and communicate effectively in academic or professional environments.",
        "C2 – Proficient: C2 represents near-native proficiency. Learners can understand almost all forms of English, including subtle meanings and complex vocabulary. Communication is precise, natural, and highly flexible in any context.",
      ],
    },
    {
      heading: "Why Knowing Your English Level Matters",
      paragraphs: [
        "Understanding your English level helps you learn more efficiently. When study materials match your ability, learning becomes more effective and motivating. Vocabulary that is too easy does not expand your skills, while vocabulary that is too advanced can feel overwhelming.",
        "By identifying your CEFR level, you can choose the right vocabulary difficulty and follow a structured learning path. Each level introduces words that gradually increase in complexity, helping you build knowledge step by step.",
        "This structured approach makes language learning clearer and more productive. As your vocabulary grows, your reading, listening, speaking, and writing abilities improve together, allowing you to progress naturally toward higher proficiency levels.",
      ],
    },
    {
      heading: "Start the English Level Test",
      paragraphs: [
        "Take the English Level Test to discover your current CEFR level from A1 to C2. Once you know your level, you can begin practicing vocabulary that matches your ability and continue building your English skills step by step.",
        "Understanding where you stand is the first step toward improvement. Start the test now and move forward with vocabulary practice designed for your level.",
      ],
    },
  ],
  practiceLinksHeading: "Practice English Vocabulary by Level",
  startButtonLabel: "Start the English Level Test",
};

const SPANISH_UI_ENGLISH_LEVEL_TEST: LevelTestContent = {
  title: "Test de nivel de inglés",
  metaTitle: "Test de nivel de inglés – Comprueba tu nivel CEFR (A1–C2)",
  metaDescription:
    "Haz el test de nivel de inglés y descubre tu nivel CEFR de A1 a C2. Empieza a practicar vocabulario que corresponde a tu nivel.",
  introParagraphs: [
    "El test de nivel de inglés te ayuda a descubrir tu nivel actual de inglés según la escala CEFR, que va desde A1 hasta C2. Al realizar el test, puedes comprender rápidamente qué tan bien reconoces y entiendes el vocabulario inglés utilizado en la comunicación cotidiana.",
    "Conocer tu nivel es un paso importante en el aprendizaje de idiomas. Muchos estudiantes estudian materiales que son demasiado fáciles o demasiado difíciles, lo que ralentiza su progreso. Este test de nivel de inglés ayuda a identificar el rango de vocabulario que ya conoces y el nivel que mejor representa tu capacidad actual.",
    "Una vez que conoces tu nivel CEFR, puedes empezar a practicar vocabulario de inglés adecuado para ese nivel. Aprender palabras apropiadas para tu nivel ayuda a desarrollar confianza, mejorar la comprensión y avanzar de forma constante hacia niveles superiores.",
  ],
  sections: [
    {
      heading: "¿Qué es el test de nivel de inglés?",
      paragraphs: [
        "El test de nivel de inglés te ayuda a descubrir tu nivel actual de inglés según la escala CEFR, que va desde A1 hasta C2. Al realizar el test, puedes comprender rápidamente qué tan bien reconoces y entiendes el vocabulario inglés utilizado en la comunicación cotidiana.",
        "Conocer tu nivel es un paso importante en el aprendizaje de idiomas. Muchos estudiantes estudian materiales que son demasiado fáciles o demasiado difíciles, lo que ralentiza su progreso. Este test de nivel de inglés ayuda a identificar el rango de vocabulario que ya conoces y el nivel que mejor representa tu capacidad actual.",
        "Una vez que conoces tu nivel CEFR, puedes empezar a practicar vocabulario de inglés adecuado para ese nivel. Aprender palabras apropiadas para tu nivel ayuda a desarrollar confianza, mejorar la comprensión y avanzar de forma constante hacia niveles superiores.",
      ],
    },
    {
      heading: "Cómo evaluar tu nivel de inglés",
      paragraphs: [
        "Evaluar tu nivel de inglés es una forma sencilla de conocer tu conocimiento actual de vocabulario. El test está diseñado para estimar qué nivel CEFR describe mejor tu capacidad para reconocer y comprender palabras comunes del inglés utilizadas en la comunicación real.",
        "El sistema CEFR divide la competencia lingüística en seis niveles, desde principiante hasta dominio avanzado. Estos niveles se utilizan internacionalmente para describir la capacidad lingüística de manera clara y coherente. Identificar tu nivel te permite comprender mejor tu capacidad actual de vocabulario.",
        "Después de descubrir tu nivel, puedes centrarte en practicar vocabulario diseñado para esa etapa. Este enfoque de aprendizaje específico permite mejorar de forma más eficiente, ampliando tu vocabulario paso a paso mientras fortaleces tus habilidades lingüísticas.",
      ],
    },
    {
      heading: "Niveles de idioma CEFR explicados",
      paragraphs: [
        "A1 – Principiante: En el nivel A1, los estudiantes comprenden y utilizan palabras y expresiones muy básicas relacionadas con situaciones cotidianas. El vocabulario incluye saludos simples, objetos comunes, números y acciones básicas usadas en contextos familiares.",
        "A2 – Elemental: Los estudiantes A2 pueden comprender vocabulario frecuente relacionado con actividades diarias como compras, viajes, familia y trabajo. La comunicación sigue siendo sencilla, pero más flexible que en el nivel principiante.",
        "B1 – Intermedio: En el nivel B1, los estudiantes pueden comprender vocabulario común utilizado en conversaciones, medios y textos cotidianos. Pueden hablar sobre experiencias, planes y opiniones en temas familiares con claridad razonable.",
        "B2 – Intermedio alto: Los estudiantes B2 poseen un vocabulario amplio que les permite comprender textos más complejos y participar activamente en discusiones. Pueden expresar ideas con claridad y entender una gran variedad de temas.",
        "C1 – Avanzado: En el nivel C1, los estudiantes comprenden vocabulario sofisticado y estructuras lingüísticas complejas. Pueden seguir textos exigentes y comunicarse con fluidez en contextos académicos o profesionales.",
        "C2 – Dominio: El nivel C2 representa una competencia cercana a la de un hablante nativo. Los estudiantes pueden comprender prácticamente todo tipo de textos y conversaciones, incluyendo significados sutiles y vocabulario complejo.",
      ],
    },
    {
      heading: "Por qué es importante conocer tu nivel de inglés",
      paragraphs: [
        "Comprender tu nivel de inglés te permite aprender de forma más eficiente. Cuando los materiales de estudio coinciden con tu capacidad, el aprendizaje se vuelve más efectivo y motivador. El vocabulario demasiado fácil no desarrolla tus habilidades, mientras que el vocabulario demasiado difícil puede resultar frustrante.",
        "Identificar tu nivel CEFR te ayuda a elegir la dificultad correcta del vocabulario y seguir un camino de aprendizaje estructurado. Cada nivel introduce nuevas palabras y conceptos que amplían tu conocimiento progresivamente.",
        "Este enfoque estructurado hace que el aprendizaje del idioma sea más claro y productivo. A medida que tu vocabulario crece, también mejoran tus habilidades de lectura, escucha, expresión oral y escritura.",
      ],
    },
    {
      heading: "Empieza el test de nivel de inglés",
      paragraphs: [
        "Haz el test de nivel de inglés para descubrir tu nivel CEFR actual entre A1 y C2. Una vez que conozcas tu nivel, podrás comenzar a practicar vocabulario que corresponda a tu capacidad.",
        "Saber tu nivel es el primer paso para mejorar. Empieza el test ahora y continúa tu aprendizaje con vocabulario adaptado a tu nivel.",
      ],
    },
  ],
  practiceLinksHeading: "Practicar vocabulario de inglés por nivel",
  startButtonLabel: "Empieza el test de nivel de inglés",
};

const FRENCH_UI_ENGLISH_LEVEL_TEST: LevelTestContent = {
  title: "Test de niveau d’anglais",
  metaTitle: "Test de niveau d’anglais – Vérifiez votre niveau CECR (A1–C2)",
  metaDescription:
    "Passez le test de niveau d’anglais et découvrez votre niveau CECR de A1 à C2. Commencez à pratiquer le vocabulaire adapté à votre niveau.",
  introParagraphs: [
    "Le test de niveau d’anglais vous permet de découvrir votre niveau actuel selon l’échelle CECR, qui va de A1 à C2. En passant ce test, vous pouvez rapidement comprendre dans quelle mesure vous reconnaissez et comprenez le vocabulaire anglais utilisé dans la communication quotidienne.",
    "Connaître son niveau est une étape essentielle dans l’apprentissage d’une langue. De nombreux apprenants utilisent des ressources trop faciles ou trop difficiles, ce qui ralentit leur progression. Ce test aide à identifier l’étendue de votre vocabulaire et le niveau qui correspond le mieux à vos compétences actuelles.",
    "Une fois votre niveau CECR identifié, vous pouvez commencer à pratiquer le vocabulaire anglais adapté à votre niveau. Apprendre des mots correspondant à votre niveau renforce la confiance, améliore la compréhension et favorise une progression régulière.",
  ],
  sections: [
    {
      heading: "Qu’est-ce que le test de niveau d’anglais ?",
      paragraphs: [
        "Le test de niveau d’anglais vous permet de découvrir votre niveau actuel selon l’échelle CECR, qui va de A1 à C2. En passant ce test, vous pouvez rapidement comprendre dans quelle mesure vous reconnaissez et comprenez le vocabulaire anglais utilisé dans la communication quotidienne.",
        "Connaître son niveau est une étape essentielle dans l’apprentissage d’une langue. De nombreux apprenants utilisent des ressources trop faciles ou trop difficiles, ce qui ralentit leur progression. Ce test aide à identifier l’étendue de votre vocabulaire et le niveau qui correspond le mieux à vos compétences actuelles.",
        "Une fois votre niveau CECR identifié, vous pouvez commencer à pratiquer le vocabulaire anglais adapté à votre niveau. Apprendre des mots correspondant à votre niveau renforce la confiance, améliore la compréhension et favorise une progression régulière.",
      ],
    },
    {
      heading: "Comment évaluer votre niveau d’anglais",
      paragraphs: [
        "Évaluer votre niveau d’anglais est un moyen simple de comprendre votre connaissance actuelle du vocabulaire. Le test permet d’estimer quel niveau CECR correspond le mieux à votre capacité à reconnaître et comprendre les mots anglais les plus utilisés.",
        "Le système CECR divise la compétence linguistique en six niveaux, du débutant à la maîtrise avancée. Ces niveaux sont utilisés internationalement pour décrire les capacités linguistiques de manière claire et cohérente.",
        "Après avoir découvert votre niveau, vous pouvez vous concentrer sur l’apprentissage du vocabulaire correspondant à cette étape. Cette approche ciblée permet d’améliorer votre vocabulaire progressivement tout en développant vos compétences linguistiques.",
      ],
    },
    {
      heading: "Niveaux de langue CECR expliqués",
      paragraphs: [
        "A1 – Débutant: Au niveau A1, les apprenants comprennent et utilisent des mots et expressions très simples liés à des situations quotidiennes. Le vocabulaire inclut des salutations, des objets courants et des actions basiques.",
        "A2 – Élémentaire: Les apprenants A2 comprennent un vocabulaire fréquent lié à la vie quotidienne, comme les achats, les voyages, la famille ou le travail. La communication reste simple mais devient plus flexible.",
        "B1 – Intermédiaire: Au niveau B1, les apprenants comprennent le vocabulaire courant présent dans les conversations et les textes quotidiens. Ils peuvent parler d’expériences, de projets et d’opinions sur des sujets familiers.",
        "B2 – Intermédiaire supérieur: Les apprenants B2 possèdent un vocabulaire plus large qui leur permet de comprendre des textes plus complexes et de participer activement à des discussions sur divers sujets.",
        "C1 – Avancé: Au niveau C1, les apprenants comprennent un vocabulaire sophistiqué et peuvent suivre des textes exigeants. Ils communiquent avec aisance dans des contextes académiques ou professionnels.",
        "C2 – Maîtrise: Le niveau C2 correspond à une maîtrise proche d’un locuteur natif. Les apprenants comprennent presque tout ce qu’ils lisent ou entendent et utilisent la langue avec précision et flexibilité.",
      ],
    },
    {
      heading: "Pourquoi connaître votre niveau d’anglais est important",
      paragraphs: [
        "Connaître votre niveau d’anglais vous permet d’apprendre plus efficacement. Lorsque les ressources correspondent à votre niveau, l’apprentissage devient plus rapide et plus motivant.",
        "Identifier votre niveau CECR vous aide à choisir le vocabulaire adapté et à suivre une progression structurée. Chaque niveau introduit de nouveaux mots et concepts qui élargissent progressivement vos compétences linguistiques.",
        "Cette approche progressive améliore la lecture, l’écoute, l’expression orale et l’écriture, permettant une progression naturelle vers des niveaux plus avancés.",
      ],
    },
    {
      heading: "Commencez le test de niveau d’anglais",
      paragraphs: [
        "Passez le test de niveau d’anglais pour découvrir votre niveau CECR entre A1 et C2. Une fois votre niveau identifié, vous pourrez commencer à pratiquer le vocabulaire correspondant.",
        "Comprendre votre niveau actuel est la première étape vers une progression efficace. Commencez le test et développez votre vocabulaire étape par étape.",
      ],
    },
  ],
  practiceLinksHeading: "Pratiquer le vocabulaire anglais par niveau",
  startButtonLabel: "Commencez le test de niveau d’anglais",
};

const GERMAN_UI_ENGLISH_LEVEL_TEST: LevelTestContent = {
  title: "Englisch Niveau-Test",
  metaTitle: "Englisch Niveau-Test – Prüfen Sie Ihr CEFR-Niveau (A1–C2)",
  metaDescription:
    "Machen Sie den Englisch Niveau-Test und entdecken Sie Ihr CEFR-Niveau von A1 bis C2. Beginnen Sie mit dem Vokabeltraining auf dem passenden Niveau.",
  introParagraphs: [
    "Der Englisch Niveau-Test hilft Ihnen dabei, Ihr aktuelles Englischniveau nach der CEFR-Skala von A1 bis C2 zu bestimmen. Mit diesem Test können Sie schnell erkennen, wie gut Sie englischen Wortschatz verstehen und in alltäglichen Situationen wiedererkennen.",
    "Das Wissen über Ihr aktuelles Sprachniveau ist ein wichtiger Schritt beim Lernen einer Fremdsprache. Viele Lernende verwenden Materialien, die entweder zu einfach oder zu schwierig sind, wodurch der Lernfortschritt langsamer wird. Dieser Englisch Niveau-Test hilft dabei, den Wortschatz zu bestimmen, den Sie bereits kennen, und das Niveau zu identifizieren, das Ihre Fähigkeiten am besten widerspiegelt.",
    "Sobald Sie Ihr CEFR-Niveau kennen, können Sie mit dem Vokabeltraining beginnen, das genau zu Ihrem Niveau passt. Das Lernen von Wörtern auf dem richtigen Schwierigkeitsgrad stärkt Ihr Verständnis, verbessert Ihre Sprachkompetenz und ermöglicht kontinuierliche Fortschritte.",
  ],
  sections: [
    {
      heading: "Was ist der Englisch Niveau-Test?",
      paragraphs: [
        "Der Englisch Niveau-Test hilft Ihnen dabei, Ihr aktuelles Englischniveau nach der CEFR-Skala von A1 bis C2 zu bestimmen. Mit diesem Test können Sie schnell erkennen, wie gut Sie englischen Wortschatz verstehen und in alltäglichen Situationen wiedererkennen.",
        "Das Wissen über Ihr aktuelles Sprachniveau ist ein wichtiger Schritt beim Lernen einer Fremdsprache. Viele Lernende verwenden Materialien, die entweder zu einfach oder zu schwierig sind, wodurch der Lernfortschritt langsamer wird. Dieser Englisch Niveau-Test hilft dabei, den Wortschatz zu bestimmen, den Sie bereits kennen, und das Niveau zu identifizieren, das Ihre Fähigkeiten am besten widerspiegelt.",
        "Sobald Sie Ihr CEFR-Niveau kennen, können Sie mit dem Vokabeltraining beginnen, das genau zu Ihrem Niveau passt. Das Lernen von Wörtern auf dem richtigen Schwierigkeitsgrad stärkt Ihr Verständnis, verbessert Ihre Sprachkompetenz und ermöglicht kontinuierliche Fortschritte.",
      ],
    },
    {
      heading: "Wie Sie Ihr Englisch-Niveau testen können",
      paragraphs: [
        "Ihr Englischniveau zu testen ist eine einfache Möglichkeit, Ihren aktuellen Wortschatz zu bewerten. Der Test hilft dabei einzuschätzen, welches CEFR-Niveau am besten zu Ihrer Fähigkeit passt, häufig verwendete englische Wörter zu erkennen und zu verstehen.",
        "Das CEFR-System unterteilt Sprachkenntnisse in sechs Stufen – von Anfänger bis nahezu muttersprachliche Kompetenz. Diese Stufen werden weltweit verwendet, um Sprachfähigkeiten klar und einheitlich zu beschreiben.",
        "Wenn Sie Ihr Niveau kennen, können Sie gezielt Wortschatz lernen, der Ihrem aktuellen Stand entspricht. Diese strukturierte Lernweise hilft Ihnen, Ihren Wortschatz schrittweise zu erweitern und Ihre Sprachkenntnisse effizient zu verbessern.",
      ],
    },
    {
      heading: "CEFR-Sprachniveaus erklärt",
      paragraphs: [
        "A1 – Anfänger: Auf dem A1-Niveau verstehen Lernende sehr einfache englische Wörter und Ausdrücke aus alltäglichen Situationen. Der Wortschatz umfasst grundlegende Begrüßungen, Zahlen, einfache Gegenstände und grundlegende Handlungen.",
        "A2 – Grundstufe: Lernende auf A2-Niveau verstehen häufig verwendeten Wortschatz aus Bereichen wie Alltag, Einkaufen, Reisen, Familie und Arbeit. Die Kommunikation bleibt einfach, ist jedoch bereits flexibler als auf dem Anfängerniveau.",
        "B1 – Mittelstufe: Auf dem B1-Niveau verstehen Lernende englischen Wortschatz aus Gesprächen, Medien und alltäglichen Texten. Sie können über Erfahrungen, Pläne und Meinungen zu bekannten Themen sprechen.",
        "B2 – Obere Mittelstufe: B2-Lernende verfügen über einen größeren Wortschatz und können komplexere Texte verstehen sowie aktiv an Diskussionen teilnehmen. Sie können Gedanken klar ausdrücken und viele Themen verstehen.",
        "C1 – Fortgeschritten: Auf dem C1-Niveau verstehen Lernende anspruchsvollen Wortschatz und komplexe Sprachstrukturen. Sie können sich fließend ausdrücken und anspruchsvolle Texte in akademischen oder beruflichen Kontexten verstehen.",
        "C2 – Sehr fortgeschritten: Das C2-Niveau entspricht nahezu muttersprachlicher Kompetenz. Lernende verstehen fast alles, was sie lesen oder hören, einschließlich komplexer Bedeutungen und anspruchsvollen Wortschatzes.",
      ],
    },
    {
      heading: "Warum es wichtig ist, Ihr Englisch-Niveau zu kennen",
      paragraphs: [
        "Wenn Sie Ihr Englischniveau kennen, können Sie effizienter lernen. Lernmaterialien, die Ihrem Niveau entsprechen, machen das Lernen verständlicher und motivierender.",
        "Wenn der Wortschatz zu einfach ist, verbessert sich Ihr Sprachlevel kaum. Wenn er zu schwierig ist, kann das Lernen frustrierend sein. Die Kenntnis Ihres CEFR-Niveaus hilft Ihnen, genau den richtigen Schwierigkeitsgrad zu wählen.",
        "Mit einer klaren Lernstruktur können Sie Ihren Wortschatz systematisch erweitern und gleichzeitig Ihre Fähigkeiten im Lesen, Hören, Sprechen und Schreiben verbessern.",
      ],
    },
    {
      heading: "Starten Sie den Englisch Niveau-Test",
      paragraphs: [
        "Machen Sie den Englisch Niveau-Test und entdecken Sie Ihr aktuelles CEFR-Niveau von A1 bis C2. Sobald Sie Ihr Niveau kennen, können Sie mit dem Vokabeltraining beginnen, das genau zu Ihrem Lernstand passt.",
        "Ihr aktuelles Niveau zu kennen ist der erste Schritt zu erfolgreichem Sprachenlernen. Starten Sie jetzt den Test und verbessern Sie Ihren englischen Wortschatz Schritt für Schritt.",
      ],
    },
  ],
  practiceLinksHeading: "Englischen Wortschatz nach Niveau üben",
  startButtonLabel: "Starten Sie den Englisch Niveau-Test",
};

const ITALIAN_UI_ENGLISH_LEVEL_TEST: LevelTestContent = {
  title: "Test di livello di inglese",
  metaTitle: "Test di livello di inglese – Verifica il tuo livello CEFR (A1–C2)",
  metaDescription:
    "Fai il test di livello di inglese e scopri il tuo livello CEFR da A1 a C2. Inizia a praticare il vocabolario adatto al tuo livello.",
  introParagraphs: [
    "Il test di livello di inglese ti aiuta a scoprire il tuo livello attuale di inglese secondo la scala CEFR, che va da A1 a C2. Grazie a questo test puoi capire rapidamente quanto bene riconosci e comprendi il vocabolario inglese utilizzato nella comunicazione quotidiana.",
    "Conoscere il proprio livello è un passo importante nell’apprendimento di una lingua. Molti studenti utilizzano materiali troppo facili o troppo difficili, rallentando così il loro progresso. Questo test aiuta a identificare il vocabolario che già conosci e il livello che rappresenta meglio le tue capacità.",
    "Una volta individuato il tuo livello CEFR, puoi iniziare a praticare il vocabolario inglese adatto al tuo livello. Studiare parole della giusta difficoltà migliora la comprensione, aumenta la sicurezza e permette un progresso costante.",
  ],
  sections: [
    {
      heading: "Che cos’è il test di livello di inglese?",
      paragraphs: [
        "Il test di livello di inglese ti aiuta a scoprire il tuo livello attuale di inglese secondo la scala CEFR, che va da A1 a C2. Grazie a questo test puoi capire rapidamente quanto bene riconosci e comprendi il vocabolario inglese utilizzato nella comunicazione quotidiana.",
        "Conoscere il proprio livello è un passo importante nell’apprendimento di una lingua. Molti studenti utilizzano materiali troppo facili o troppo difficili, rallentando così il loro progresso. Questo test aiuta a identificare il vocabolario che già conosci e il livello che rappresenta meglio le tue capacità.",
        "Una volta individuato il tuo livello CEFR, puoi iniziare a praticare il vocabolario inglese adatto al tuo livello. Studiare parole della giusta difficoltà migliora la comprensione, aumenta la sicurezza e permette un progresso costante.",
      ],
    },
    {
      heading: "Come testare il tuo livello di inglese",
      paragraphs: [
        "Testare il tuo livello di inglese è un modo semplice per valutare la tua conoscenza attuale del vocabolario. Il test aiuta a stimare quale livello CEFR descrive meglio la tua capacità di riconoscere e comprendere parole inglesi comuni.",
        "Il sistema CEFR divide la competenza linguistica in sei livelli, dal principiante alla padronanza avanzata. Questi livelli sono utilizzati a livello internazionale per descrivere le competenze linguistiche in modo chiaro.",
        "Una volta scoperto il tuo livello, puoi concentrarti sull’apprendimento del vocabolario adatto a quella fase. Questo approccio ti permette di migliorare in modo più efficace, ampliando il vocabolario passo dopo passo.",
      ],
    },
    {
      heading: "Livelli linguistici CEFR spiegati",
      paragraphs: [
        "A1 – Principiante: Al livello A1 gli studenti comprendono parole ed espressioni molto semplici utilizzate nelle situazioni quotidiane. Il vocabolario include saluti di base, oggetti comuni e azioni semplici.",
        "A2 – Elementare: Gli studenti A2 comprendono vocaboli frequenti legati alla vita quotidiana come acquisti, viaggi, famiglia e lavoro. La comunicazione rimane semplice ma diventa più flessibile.",
        "B1 – Intermedio: Al livello B1 gli studenti comprendono il vocabolario utilizzato nelle conversazioni quotidiane e nei testi comuni. Possono parlare di esperienze, progetti e opinioni su argomenti familiari.",
        "B2 – Intermedio superiore: Gli studenti B2 possiedono un vocabolario più ampio che consente di comprendere testi più complessi e partecipare attivamente alle discussioni.",
        "C1 – Avanzato: Al livello C1 gli studenti comprendono vocaboli complessi e strutture linguistiche avanzate. Possono comunicare con scioltezza in contesti accademici o professionali.",
        "C2 – Padronanza: Il livello C2 rappresenta una competenza quasi pari a quella di un madrelingua. Gli studenti comprendono quasi tutto ciò che leggono o ascoltano e usano la lingua con grande precisione.",
      ],
    },
    {
      heading: "Perché conoscere il tuo livello di inglese è importante",
      paragraphs: [
        "Conoscere il proprio livello di inglese permette di studiare in modo più efficiente. Quando il materiale di studio è adatto al tuo livello, l’apprendimento diventa più efficace e motivante.",
        "Un vocabolario troppo facile non permette di migliorare, mentre uno troppo difficile può risultare frustrante. Identificare il tuo livello CEFR ti aiuta a scegliere il giusto grado di difficoltà.",
        "Questo approccio strutturato consente di ampliare gradualmente il vocabolario e migliorare le competenze linguistiche complessive.",
      ],
    },
    {
      heading: "Inizia il test di livello di inglese",
      paragraphs: [
        "Fai il test di livello di inglese per scoprire il tuo livello CEFR tra A1 e C2. Dopo aver individuato il tuo livello, potrai iniziare a praticare il vocabolario più adatto.",
        "Sapere il proprio livello è il primo passo per migliorare. Inizia il test e sviluppa il tuo vocabolario passo dopo passo.",
      ],
    },
  ],
  practiceLinksHeading: "Pratica il vocabolario inglese per livello",
  startButtonLabel: "Inizia il test di livello di inglese",
};

const PORTUGUESE_UI_ENGLISH_LEVEL_TEST: LevelTestContent = {
  title: "Teste de nível de inglês",
  metaTitle: "Teste de nível de inglês – Verifique seu nível CEFR (A1–C2)",
  metaDescription:
    "Faça o teste de nível de inglês e descubra seu nível CEFR de A1 a C2. Comece a praticar vocabulário adequado ao seu nível.",
  introParagraphs: [
    "O teste de nível de inglês ajuda você a descobrir seu nível atual de inglês de acordo com a escala CEFR, que vai de A1 a C2. Ao fazer o teste, você pode entender rapidamente o quanto reconhece e compreende o vocabulário inglês usado na comunicação cotidiana.",
    "Conhecer seu nível é um passo importante no aprendizado de um idioma. Muitos estudantes utilizam materiais que são fáceis demais ou difíceis demais, o que acaba diminuindo a eficiência do aprendizado. Este teste ajuda a identificar o vocabulário que você já conhece e o nível que melhor representa sua capacidade atual.",
    "Depois de descobrir seu nível CEFR, você pode começar a praticar o vocabulário inglês adequado ao seu nível. Estudar palavras no nível correto melhora a compreensão, aumenta a confiança e permite um progresso constante no aprendizado do idioma.",
  ],
  sections: [
    {
      heading: "O que é o teste de nível de inglês?",
      paragraphs: [
        "O teste de nível de inglês ajuda você a descobrir seu nível atual de inglês de acordo com a escala CEFR, que vai de A1 a C2. Ao fazer o teste, você pode entender rapidamente o quanto reconhece e compreende o vocabulário inglês usado na comunicação cotidiana.",
        "Conhecer seu nível é um passo importante no aprendizado de um idioma. Muitos estudantes utilizam materiais que são fáceis demais ou difíceis demais, o que acaba diminuindo a eficiência do aprendizado. Este teste ajuda a identificar o vocabulário que você já conhece e o nível que melhor representa sua capacidade atual.",
        "Depois de descobrir seu nível CEFR, você pode começar a praticar o vocabulário inglês adequado ao seu nível. Estudar palavras no nível correto melhora a compreensão, aumenta a confiança e permite um progresso constante no aprendizado do idioma.",
      ],
    },
    {
      heading: "Como testar seu nível de inglês",
      paragraphs: [
        "Testar seu nível de inglês é uma forma simples de avaliar seu conhecimento atual de vocabulário. O teste ajuda a estimar qual nível CEFR descreve melhor sua capacidade de reconhecer e compreender palavras inglesas usadas com frequência.",
        "O sistema CEFR divide a proficiência linguística em seis níveis, do iniciante ao domínio avançado. Esses níveis são usados internacionalmente para descrever habilidades linguísticas de maneira clara e padronizada.",
        "Depois de descobrir seu nível, você pode focar no aprendizado de vocabulário correspondente a essa etapa. Esse método permite melhorar de forma mais eficiente, ampliando seu vocabulário gradualmente.",
      ],
    },
    {
      heading: "Níveis de idioma CEFR explicados",
      paragraphs: [
        "A1 – Iniciante: No nível A1, os estudantes compreendem palavras e expressões muito básicas relacionadas a situações do dia a dia. O vocabulário inclui saudações simples, objetos comuns e ações básicas.",
        "A2 – Básico: Estudantes A2 conseguem compreender vocabulário frequente relacionado à vida cotidiana, como compras, viagens, família e trabalho. A comunicação ainda é simples, mas já mais flexível.",
        "B1 – Intermediário: No nível B1, os estudantes compreendem vocabulário usado em conversas, mídias e textos cotidianos. Eles conseguem falar sobre experiências, planos e opiniões em temas familiares.",
        "B2 – Intermediário avançado: Estudantes B2 possuem um vocabulário mais amplo que permite compreender textos mais complexos e participar de discussões com mais segurança.",
        "C1 – Avançado: No nível C1, os estudantes compreendem vocabulário sofisticado e estruturas linguísticas mais complexas. Eles conseguem se comunicar com fluência em contextos acadêmicos ou profissionais.",
        "C2 – Proficiência: O nível C2 representa uma competência próxima à de um falante nativo. Os estudantes conseguem compreender praticamente qualquer tipo de texto ou conversa e utilizar o idioma com precisão.",
      ],
    },
    {
      heading: "Por que conhecer seu nível de inglês é importante",
      paragraphs: [
        "Conhecer seu nível de inglês permite aprender de maneira mais eficiente. Quando o material de estudo corresponde ao seu nível, o aprendizado se torna mais claro e motivador.",
        "Se o vocabulário for muito fácil, o progresso é pequeno. Se for muito difícil, o aprendizado pode se tornar frustrante. Identificar seu nível CEFR ajuda a escolher a dificuldade correta.",
        "Esse processo estruturado permite ampliar o vocabulário gradualmente e melhorar habilidades como leitura, escuta, fala e escrita.",
      ],
    },
    {
      heading: "Comece o teste de nível de inglês",
      paragraphs: [
        "Faça o teste de nível de inglês para descobrir seu nível CEFR entre A1 e C2. Depois de identificar seu nível, você pode começar a praticar o vocabulário adequado.",
        "Conhecer seu nível atual é o primeiro passo para melhorar. Comece o teste agora e desenvolva seu vocabulário de inglês passo a passo.",
      ],
    },
  ],
  practiceLinksHeading: "Praticar vocabulário de inglês por nível",
  startButtonLabel: "Comece o teste de nível de inglês",
};

const RUSSIAN_UI_ENGLISH_LEVEL_TEST: LevelTestContent = {
  title: "Тест уровня английского",
  metaTitle: "Тест уровня английского — Определите свой уровень CEFR (A1–C2)",
  metaDescription:
    "Пройдите тест уровня английского и узнайте свой уровень CEFR от A1 до C2. Начните изучать английскую лексику, соответствующую вашему уровню.",
  introParagraphs: [
    "Тест уровня английского помогает определить ваш текущий уровень владения английским языком по шкале CEFR — от A1 до C2. Пройдя этот тест, вы сможете быстро понять, насколько хорошо вы распознаёте и понимаете английскую лексику, используемую в повседневном общении.",
    "Знание своего уровня — важный шаг в изучении языка. Многие изучающие используют материалы, которые либо слишком простые, либо слишком сложные, что замедляет прогресс. Этот тест помогает определить объём словарного запаса, которым вы уже владеете, и уровень, который лучше всего отражает ваши текущие навыки.",
    "После определения уровня CEFR вы сможете начать изучение английской лексики, соответствующей вашему уровню. Изучение слов подходящей сложности улучшает понимание языка, повышает уверенность и способствует постепенному прогрессу.",
  ],
  sections: [
    {
      heading: "Что такое тест уровня английского?",
      paragraphs: [
        "Тест уровня английского помогает определить ваш текущий уровень владения английским языком по шкале CEFR — от A1 до C2. Пройдя этот тест, вы сможете быстро понять, насколько хорошо вы распознаёте и понимаете английскую лексику, используемую в повседневном общении.",
        "Знание своего уровня — важный шаг в изучении языка. Многие изучающие используют материалы, которые либо слишком простые, либо слишком сложные, что замедляет прогресс. Этот тест помогает определить объём словарного запаса, которым вы уже владеете, и уровень, который лучше всего отражает ваши текущие навыки.",
        "После определения уровня CEFR вы сможете начать изучение английской лексики, соответствующей вашему уровню. Изучение слов подходящей сложности улучшает понимание языка, повышает уверенность и способствует постепенному прогрессу.",
      ],
    },
    {
      heading: "Как проверить свой уровень английского",
      paragraphs: [
        "Проверка уровня английского — это простой способ оценить ваш текущий словарный запас. Тест помогает определить, какой уровень CEFR лучше всего соответствует вашей способности распознавать и понимать часто используемые английские слова.",
        "Система CEFR делит владение языком на шесть уровней — от начального до уровня практически носителя языка. Эти уровни используются во всём мире для чёткого описания языковых навыков.",
        "Определив свой уровень, вы сможете сосредоточиться на изучении словарного запаса, соответствующего вашему этапу обучения. Такой подход позволяет постепенно расширять словарный запас и улучшать языковые навыки.",
      ],
    },
    {
      heading: "Уровни языка CEFR",
      paragraphs: [
        "A1 — Начальный: На уровне A1 изучающие понимают и используют очень простые слова и выражения, связанные с повседневными ситуациями. Словарный запас включает базовые приветствия, числа, предметы и простые действия.",
        "A2 — Базовый: Уровень A2 позволяет понимать часто используемую лексику, связанную с повседневной жизнью, например покупки, путешествия, семью и работу. Общение остаётся простым, но становится более гибким.",
        "B1 — Средний: На уровне B1 изучающие понимают лексику, используемую в разговорах, медиа и повседневных текстах. Они могут говорить о событиях, планах и мнениях по знакомым темам.",
        "B2 — Выше среднего: Изучающие уровня B2 обладают более широким словарным запасом, что позволяет понимать более сложные тексты и активно участвовать в обсуждениях.",
        "C1 — Продвинутый: На уровне C1 изучающие понимают сложную лексику и языковые структуры. Они могут свободно общаться и понимать сложные тексты в академической или профессиональной среде.",
        "C2 — Свободное владение: Уровень C2 соответствует практически носителю языка. Изучающие понимают почти всё, что читают или слышат, включая сложные значения и нюансы языка.",
      ],
    },
    {
      heading: "Почему важно знать свой уровень английского",
      paragraphs: [
        "Понимание своего уровня английского помогает учиться более эффективно. Когда учебные материалы соответствуют вашему уровню, обучение становится более продуктивным и мотивирующим.",
        "Слишком лёгкая лексика не способствует развитию навыков, а слишком сложная может вызывать трудности. Определение уровня CEFR помогает выбрать правильную сложность обучения.",
        "Такой структурированный подход позволяет постепенно расширять словарный запас и одновременно улучшать навыки чтения, аудирования, говорения и письма.",
      ],
    },
    {
      heading: "Начните тест уровня английского",
      paragraphs: [
        "Пройдите тест уровня английского, чтобы определить свой уровень CEFR от A1 до C2. После этого вы сможете начать изучение лексики, соответствующей вашему уровню.",
        "Знание своего текущего уровня — первый шаг к прогрессу. Начните тест сейчас и развивайте свой словарный запас шаг за шагом.",
      ],
    },
  ],
  practiceLinksHeading: "Практика английской лексики по уровням",
  startButtonLabel: "Начните тест уровня английского",
};

const LEVEL_TEST_CONTENT: Partial<
  Record<UiLanguageCode, Partial<Record<TargetLanguageSlug, LevelTestContent>>>
> = {
  en: {
    english: ENGLISH_UI_ENGLISH_LEVEL_TEST,
  },
  es: {
    english: SPANISH_UI_ENGLISH_LEVEL_TEST,
  },
  fr: {
    english: FRENCH_UI_ENGLISH_LEVEL_TEST,
  },
  de: {
    english: GERMAN_UI_ENGLISH_LEVEL_TEST,
  },
  it: {
    english: ITALIAN_UI_ENGLISH_LEVEL_TEST,
  },
  pt: {
    english: PORTUGUESE_UI_ENGLISH_LEVEL_TEST,
  },
  ru: {
    english: RUSSIAN_UI_ENGLISH_LEVEL_TEST,
  },
};

export function getLevelTestContent(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): LevelTestContent | null {
  return LEVEL_TEST_CONTENT[uiLang]?.[targetLanguage] ?? null;
}

export function getLevelTestSeoPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): string | null {
  return LEVEL_TEST_PATHS[uiLang]?.[targetLanguage] ?? null;
}

export function resolveLevelTestSeoRoute(path: string): {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
} | null {
  for (const [uiLang, targetMap] of Object.entries(LEVEL_TEST_PATHS) as Array<
    [UiLanguageCode, Partial<Record<TargetLanguageSlug, string>>]
  >) {
    for (const [targetLanguage, routePath] of Object.entries(targetMap) as Array<
      [TargetLanguageSlug, string]
    >) {
      if (routePath === path) {
        return { uiLang, targetLanguage };
      }
    }
  }

  return null;
}

export function getEnglishLevelPracticeLinks(uiLang: UiLanguageCode) {
  const levels = ["a1", "a2", "b1", "b2", "c1", "c2"] as const;
  const labelBuilder: Record<UiLanguageCode, (level: string) => string> = {
    en: (level) => `English ${level} Vocabulary Practice`,
    es: (level) => `Vocabulario de inglés ${level}`,
    fr: (level) => `Vocabulaire anglais ${level}`,
    de: (level) => `Englisch ${level} Wortschatz`,
    it: (level) => `Vocabolario inglese ${level}`,
    pt: (level) => `Vocabulário de inglês ${level}`,
    ru: (level) => `Английская лексика ${level}`,
  };

  return levels
    .map((level) => ({
      level: level.toUpperCase(),
      href: buildLocalizedVocabularyPath(uiLang, "english", level),
      label: (labelBuilder[uiLang] ?? labelBuilder.en)(level.toUpperCase()),
    }))
    .filter((item) => Boolean(item.href));
}
