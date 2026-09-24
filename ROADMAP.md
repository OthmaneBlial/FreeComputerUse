# FreeComputerUse — roadmap de publication

**État actualisé le 24 septembre 2026.** Ce document décrit des travaux à faire ; il ne déclare pas que les validations, intégrations ou publications listées sont déjà terminées.

## Résumé de l’audit

FreeComputerUse est un agent d’automatisation de navigateur local. Il observe le DOM, demande un plan à un fournisseur de modèle, exécute des actions typées avec Playwright, vérifie le résultat et peut rejouer certains workflows compatibles sans nouvel appel au modèle. Le dépôt contient aussi une interface locale, un laboratoire Web statique et un CLI.

### État vérifié

- `package.json` déclare la version `0.1.0`, Node `>=22.13.0`, un exécutable CLI `agent`, une entrée de bibliothèque et une liste de fichiers à inclure dans le paquet npm.
- Le dépôt contient neuf fichiers de tests, avec environ 45 cas déclarés. Les tests n’ont pas été exécutés pendant cet audit ; leur état actuel est **non vérifié**.
- `npm run validate` est défini pour reconstruire le laboratoire, compiler, exécuter les tests, construire le paquet, analyser les secrets et auditer les dépendances. Il n’a pas été exécuté ici.
- `docs/BENCHMARKS.md` rapporte un essai daté du 18 septembre : 14/14 tâches publiques et leurs répétitions compatibles réussies dans cet essai, avec DeepSeek, une seule mesure par cas et des limites explicitement documentées. Le même document rapporte des résultats variables sur les tâches complexes et un audit GitHub Playwright non réussi. Cela ne prouve pas une réussite générale sur le Web.
- Le README décrit plusieurs routes de modèles : API compatibles OpenAI, Anthropic, OpenRouter et interfaces CLI pour abonnements Codex et Claude Code. La matrice de compatibilité n’est pas accompagnée d’une validation réelle et versionnée de chaque fournisseur.
- Le site GitHub Pages existe et est servi depuis `main /docs`. Le dépôt n’a pas de tag ni de release GitHub. `npm view free-computer-use` renvoie actuellement une erreur 404 : le paquet npm n’est pas publié sous ce nom.
- Le dépôt ne contient pas de workflow GitHub Actions. `docs/LOCAL_VALIDATION.md` indique que sa suppression était demandée par le propriétaire et interdit de réactiver ou déclencher les validations GitHub. Cette contrainte doit être respectée tant qu’elle n’est pas modifiée explicitement.
- Un problème de source de vérité bloque une validation reproductible : `npm run validate` commence par `npm run lab:build`, et `scripts/build-lab.ts` remplace `docs/index.html` par `lab/index.html`. Une validation peut donc écraser la page de présentation actuelle.
- Il existe des vidéos MP4 de démonstration et un script de capture Playwright. Les fichiers existants ne constituent pas encore la démonstration finale exigée ici : ils ne prouvent pas à eux seuls une installation propre suivie d’un parcours complet du produit publié.
- Le projet annonce une exécution locale et des protections concrètes : permissions par site, DSL d’actions validé, interface liée à loopback, contrôles de requêtes locales, stockage local et masquage de certaines données. Les protections de contrôles sensibles incluent des heuristiques et ne garantissent pas la détection de toutes les pages trompeuses.

### Lacunes prioritaires

1. Fiabiliser le chemin de publication, les sources du site et la validation reproductible.
2. Établir précisément quels fournisseurs API et abonnements fonctionnent, avec quelles versions et limites.
3. Rendre l’installation, la première configuration, les permissions et les échecs compréhensibles sur un environnement vierge.
4. Étendre les preuves de sécurité et de compatibilité sans élargir les promesses au-delà des essais réels.
5. Publier une voie d’installation vérifiée, une release téléchargeable, une documentation de contribution et des preuves produit actuelles.
6. Produire la vidéo réelle seulement après validation et publication des phases précédentes.

## Positionnement et adoption

Le projet peut se distinguer par un agent qui garde l’exécution dans le navigateur local de l’utilisateur, rend les permissions et actions inspectables, vérifie les résultats et réutilise un workflow compatible sans coût modèle. Il ne devrait pas promettre « tous les modèles », « tous les sites » ou un taux de réussite universel avant d’avoir les mesures correspondantes.

Les références à surveiller couvrent des catégories différentes : [Browser Use](https://github.com/browser-use/browser-use) propose des agents et options d’exécution locales ou hébergées ; [Stagehand](https://github.com/browserbase/stagehand) est un framework TypeScript d’automatisation agentique ; [Playwright MCP](https://github.com/microsoft/playwright-mcp) expose le navigateur via MCP ; [agent-browser](https://github.com/vercel-labs/agent-browser) fournit une CLI d’automatisation pour agents. Leur distribution et leurs intégrations constituent une concurrence forte. La priorité de FreeComputerUse doit être une expérience locale sûre, facile à reproduire et appuyée par des résultats vérifiables, puis une intégration standard comme MCP si elle reste utile après stabilisation du cœur.

Les étoiles ne sont pas un critère de livraison contrôlable. Suivre plutôt les installations réussies, les tâches reproductibles, les issues résolues, les contributeurs actifs et les téléchargements de releases, puis observer les étoiles comme indicateur secondaire.

## Phases

Les priorités indiquent l’ordre de travail : **P0** bloque une release crédible ; **P1** améliore fortement l’adoption et la confiance ; **P2** est une extension après stabilisation. Une phase ne passe à la suivante qu’après ses critères vérifiables. Toute preuve externe (publication npm, release, disponibilité Pages) doit être vérifiée sur le service concerné.

### Phase 0 — Fixer le contrat produit et rétablir une validation sûre (P0)

#### 0.1 [x] Définir la matrice des capacités et les limites annoncées

- **Objectif :** remplacer les formulations générales par une promesse testable.
- **Changements :** définir les tâches supportées, navigateurs, OS/versions Node, fournisseurs API, fournisseurs compatibles OpenAI, abonnements CLI, fonctions de workflow et limites connues. Distinguer intégration présente, test simulé, essai live et compatibilité non vérifiée.
- **Fichiers :** `README.md`, `docs/IMPLEMENTATION.md`, `docs/REQUIREMENTS.md`, `docs/BENCHMARKS.md`, nouveau `docs/SUPPORT_MATRIX.md`.
- **Acceptation :** chaque promesse publique renvoie à un critère ou à une preuve datée ; aucune intégration n’est marquée vérifiée sans essai documenté ; version, OS et modèle figurent dans chaque mesure.
- **Validation :** revue manuelle des affirmations README/site et comparaison avec les modules et rapports existants.
- **Dépendances / risques :** dépend d’essais fournisseurs des phases 1 et 4 ; certaines lignes resteront « non vérifiées » au départ.

#### 0.2 [x] Réparer la source de vérité de GitHub Pages

- **Objectif :** faire en sorte que les commandes de validation ne détruisent pas la présentation publique.
- **Changements :** séparer le point d’entrée vitrine de la génération du laboratoire, ou déplacer la page vitrine vers sa source canonique puis la construire de façon reproductible. Documenter l’arborescence résultante.
- **Fichiers :** `scripts/build-lab.ts`, `lab/index.html`, `docs/index.html`, `package.json`, tests de génération du site.
- **Acceptation :** deux exécutions successives de la commande de build produisent le même arbre ; la vitrine et les liens du laboratoire restent présents ; aucune page générée ne remplace une source éditoriale sans intention explicite.
- **Validation :** générer deux fois dans une copie propre, comparer les empreintes, vérifier les liens internes et ouvrir la sortie locale.
- **Dépendances / risques :** doit précéder toute exécution future de `npm run validate` et toute mise à jour de Pages.

### Phase 1 — Compatibilité modèles et abonnements réellement vérifiée (P0)

#### 1.1 [x] Établir un contrat commun pour les fournisseurs

- **Objectif :** rendre le choix du fournisseur prévisible et simplifier les erreurs.
- **Changements :** vérifier configuration, authentification, modèle, format structuré, délais d’expiration, erreurs de quota, reprise contrôlée et coût estimé. Garder une validation de sortie commune et ne jamais inclure les clés dans les journaux.
- **Fichiers :** `src/llm/*`, `.env.example`, `src/cli/*`, `tests/provider.test.ts`, `docs/PROVIDERS.md`.
- **Acceptation :** chaque adaptateur a des tests de contrat hors réseau ; une configuration invalide échoue avant d’ouvrir le navigateur ; les erreurs indiquent une correction concrète et n’exposent pas la clé.
- **Validation :** tests contractuels avec réponses et erreurs HTTP simulées ; tout essai live reste une validation distincte, explicitement opt-in, suivie en phase 1.2.
- **Dépendances / risques :** tarifs, noms de modèles et API changent ; les résultats live doivent porter date, version SDK/protocole et modèle.

#### 1.2 [x] Vérifier les fournisseurs prioritaires et publier les limites de compatibilité

- **Objectif :** permettre un choix honnête parmi les modèles connus sans revendiquer une compatibilité universelle.
- **Changements :** valider d’abord OpenAI, Anthropic, xAI/Grok, Google/Gemini, DeepSeek, Mistral et OpenRouter selon leur route réellement implémentée ; tester API native ou compatibilité OpenAI, limites JSON et paramètres requis ; ajouter uniquement les adaptateurs manquants justifiés par la matrice.
- **Fichiers :** `src/llm/`, `.env.example`, `docs/SUPPORT_MATRIX.md`, `docs/PROVIDERS.md`, tests provider.
- **Acceptation :** une ligne par fournisseur indique route, modèle essayé, date, cas passé/échoué et fonctions absentes ; les exemples de configuration sont copiables et n’utilisent aucune fausse clé ; un échec n’est pas converti en compatibilité positive. Sans accès live, le fournisseur reste explicitement « non vérifié ».
- **Validation exécutée le 23 septembre 2026 :** 10/10 tests contractuels fournisseur passent, dont les paramètres OpenAI, la normalisation JSON Schema, les routes Anthropic et abonnements CLI ; un smoke DeepSeek séparé a produit un plan synthétique en un appel. OpenAI, xAI/Grok, Gemini, Mistral et OpenRouter restent indiqués comme non vérifiés en live dans `docs/SUPPORT_MATRIX.md`.
- **Limite :** aucun compte ou clé live n’était disponible pour les autres fournisseurs. Leur statut reste « non vérifié » ; aucune compatibilité live n’est revendiquée.
- **Dépendances / risques :** les essais live nécessitent des comptes/clés disponibles et peuvent engendrer des frais ; ne pas envoyer de données privées ni coller des clés dans le dépôt ou le chat.

#### 1.3 [x] Durcir et documenter les connexions par abonnement

- **Objectif :** rendre les voies Codex/ChatGPT et Claude Code compréhensibles malgré leur dépendance à des outils et versions externes.
- **Changements :** vérifier les commandes installées, la détection de versions, le flux d’authentification pris en charge, les permissions, les messages d’expiration et la désactivation propre ; documenter les différences avec les API key. Ajouter des adaptateurs uniquement à partir des interfaces CLI réellement prises en charge.
- **Fichiers :** `src/llm/*Subscription*`, `src/cli/*`, `README.md`, `docs/PROVIDERS.md`, tests fournisseur.
- **Acceptation :** chaque abonnement dispose d’un test d’intégration reproductible ou reste explicitement non vérifié ; aucun contournement de limites d’abonnement ; une absence de CLI ou une version incompatible donne une marche à suivre sans faire échouer toute l’app.
- **Validation :** faux exécutable CLI pour les tests d’erreur et de format ; smoke manuel sur les versions minimales et actuelles documentées, sans consigner les jetons d’authentification.
- **Validation exécutée le 23 septembre 2026 :** 11/11 tests fournisseur passent. Les tests CLI couvrent version minimale Claude, appels restreints, isolation des variables API, absence de commande et compte non connecté. Le smoke Codex CLI `0.156.1`/ChatGPT passe sur un plan synthétique. Claude reste non vérifié en live : le binaire local échoue à `claude --version` avec une erreur Node, consignée dans `docs/SUPPORT_MATRIX.md`.
- **Dépendances / risques :** les interfaces CLI et conditions d’utilisation peuvent changer sans préavis ; dépend d’une veille de compatibilité.

#### 1.4 [x] Fiabiliser le diagnostic fournisseur déjà présent

- **Objectif :** réduire les erreurs avant la première tâche.
- **Changements :** le CLI contient déjà `agent doctor` et `agent doctor --api`. Vérifier leurs contrôles de Node, navigateur, configuration, endpoint, modèle et connexion CLI ; combler les lacunes sans créer une seconde commande ; expliquer les étapes de connexion API et abonnement.
- **Fichiers :** `src/cli/*`, `src/llm/*`, `package.json`, `.env.example`, `README.md`, `docs/PROVIDERS.md`.
- **Acceptation :** diagnostic par défaut sans appel fournisseur ; `--api` clairement signalé comme requête réseau ; codes de sortie documentés, clés masquées dans toutes les sorties et erreurs exploitables.
- **Validation :** tests CLI avec environnement propre, configuration absente/partielle, faux CLIs et erreur réseau simulée.
- **Dépendances / risques :** réutiliser les mécanismes de configuration existants ; ne pas construire un assistant complexe si une commande courte suffit.

### Phase 2 — Sécurité, confidentialité et reprise fiable (P0)

#### 2.1 [x] Définir les menaces et garder l’humain dans la boucle

- **Objectif :** expliciter ce que l’agent peut voir et modifier et où l’approbation reste obligatoire.
- **Changements :** créer un modèle de menace couvrant prompt injection, pages malveillantes, redirections, DNS rebinding, requêtes locales, WebSocket, téléchargements, formulaires sensibles, contrôles trompeurs, profils persistants et CLI de fournisseur. Documenter l’adversaire visé et les limites de détection heuristique.
- **Fichiers :** `SECURITY.md`, nouveau `docs/THREAT_MODEL.md`, `src/actions/policy.ts`, `src/server/index.ts`, tests sécurité.
- **Acceptation :** chaque menace a une mesure existante ou une tâche corrective priorisée ; toutes les actions sensibles ont une règle et un message d’approbation observables ; la documentation ne promet pas une protection totale contre l’injection.
- **Validation :** revue de sécurité guidée par scénarios et tests négatifs ajoutés pour toute limite révélée.
- **Dépendances / risques :** audit de conception nécessaire avant d’élargir les intégrations ; l’approbation utilisateur ne neutralise pas une compromission locale de la machine.

#### 2.2 [x] Renforcer les frontières d’URL, de fichiers et d’actions

- **Objectif :** empêcher qu’une page ou une configuration fasse sortir le navigateur et les écritures de leurs limites attendues.
- **Changements :** tester résolution DNS et redirections vers réseaux privés, variations IPv6, navigation inter-origines, requêtes WebSocket, chemins de téléchargement, liens symboliques, noms Unicode, profils et paramètres importés. Préserver les permissions par origine et l’arrêt explicite.
- **Fichiers :** `src/browser/*`, `src/actions/*`, `src/server/index.ts`, stockage/profils, `tests/security.test.ts`, tests navigateur.
- **Acceptation :** aucun scénario interdit n’atteint une cible locale non approuvée ni n’écrit hors du répertoire autorisé ; les cas autorisés continuent de fonctionner ; chaque refus expose sa raison sans divulguer d’information secrète.
- **Validation :** tests unitaires négatifs et tests Playwright locaux sur fixtures dédiées ; vérifier aussi les cas autorisés pour éviter les faux blocages.
- **Dépendances / risques :** les protections réseau varient selon OS et navigateur ; toute exception localhost doit rester limitée au mode de test documenté.
- **État validé :** une interception CDP locale s’attache aux pages avant leur première navigation. Une redirection rapide de popup est bloquée avant toute requête cible sans approbation et fonctionne après approbation. Les URL contenant des identifiants et les schémas non HTTP sont rejetés avant la création d’une trace. Un proxy lié à loopback applique la permission d’origine aux requêtes HTTP, tunnels HTTPS et WebSockets ; en mode normal, il bloque les plages privées/réservées et ouvre le socket vers l’adresse numérique issue de la même résolution. Les tests simulent un premier DNS public puis une réponse loopback juste avant la connexion : aucune requête HTTP ni aucun socket tunnel n’atteint la cible. Les tests DNS couvrent les plages IPv4/IPv6 privées et réservées, IPv4 mappée, NAT64 connu et des adresses publiques autorisées. La découverte DNS64 classifie les IPv4 encapsulées dans les six préfixes RFC 6052. Les tests Chrome vérifient les WebSockets approuvés/refusés, les redirections, le blocage d’un tunnel CONNECT en clair de type SSH et l’absence de paquets STUN hors proxy. Les téléchargements rejettent un dossier destination symbolique ; les noms avec traversée Windows sont confinés et Unicode normalisé. Les imports profil n’acceptent que le schéma local ; un import invalide conserve le profil valide, les fichiers profil symboliques sont refusés et leur sauvegarde utilise un remplacement temporaire atomique en mode `0600` sur macOS.
- **Validation de clôture (24 septembre 2026) :** `FCU_BROWSER_CHANNEL=chrome ./node_modules/.bin/tsx --test --test-concurrency=1 tests/security.test.ts tests/actions.test.ts` passe **39/39** sur macOS `26.6`, Node `25.9.0`, Apple Silicon et Chrome système `154.0.8037.57`. `npm run check` passe. Un smoke distinct `FCU_BROWSER_CHANNEL=chrome npm run security:wss` a vérifié le retour d’un message synthétique depuis Postman Echo avec la validation TLS normale de Chrome. Ces preuves couvrent la seule cible actuellement vérifiée.
- **Limites hors de cette cible :** le résolveur système ne renvoie que des A pour `ipv4only.arpa`, donc aucun réseau NAT64 réel n’est validé ; les autres moteurs/versions, systèmes, Chromium Playwright empaqueté, protocoles non HTTP au-delà des fixtures WSS/STUN et sites nécessitant WebRTC UDP direct restent non vérifiés. Ces limites ne sont pas des promesses de support ; les résultats publiés dans `docs/SUPPORT_MATRIX.md` restent bornés à Chrome système sur macOS.

- **Cas d’URL non HTTP (24 septembre 2026) :** tests agent et dashboard confirment que `file:`, `data:`, `javascript:` et `ftp:` sont rejetés avant création de trace/agent ; l’API renvoie `400` pour une URL `file:`. Un test navigateur confirme qu’une action `navigate` vers `file:///etc/passwd`, même en mode Ultra, échoue avant le changement de page. Une page locale tente aussi une navigation directe et une redirection HTTP 302 vers un fichier synthétique ; Chrome `154.0.8037.57` garde l’origine dans le premier cas et affiche sa page d’erreur dans le second, sans révéler le contenu du fichier. Une validation complète antérieure passe 100/100 avec Chrome système `154.0.8037.57` sur macOS `26.6` / Node `25.9.0`. Après ajout du scénario de redirection, `npm run check` et le test navigateur ciblé passent ; une suite complète a échoué une fois à 99/100 sur un 502 local du test dashboard, puis le test isolé a passé 1/1. Deux suites complètes suivantes passent 100/100, dont une sur le code final sans instrumentation temporaire ; le 502 ne se reproduit pas, sa cause reste inconnue. Cela couvre les schémas initiaux, une action `navigate` et les cas page-vers-fichier direct/redirect ; pas chaque protocole déclenchable depuis une page. Les limites de NAT64 réelle, autres moteurs/OS et trafic non HTTP restent hors de la cible validée et ne sont pas revendiquées comme supportées.

#### 2.3 [x] Garantir le traitement local des secrets et données de session

- **Objectif :** rendre la conservation des profils, clés, journaux et traces maîtrisable.
- **Changements :** auditer permissions fichiers, masquage de secrets, durée/rétention des traces, nettoyage, export/import sûr et comportement de sauvegarde ; préciser que les fichiers locaux ne sont pas chiffrés si aucun chiffrement n’est livré. Ne pas ajouter de synchronisation cloud implicite.
- **Fichiers :** stockage `src/*`, `SECURITY.md`, `README.md`, tests sécurité et résultats.
- **Acceptation :** un utilisateur peut localiser, inspecter, exporter et supprimer ses données selon une procédure documentée ; aucun secret n’apparaît dans traces, rapport d’erreur ou capture ; l’import invalide ne corrompt pas l’état existant.
- **Validation :** tests de permissions sur OS supportés, recherche de secrets dans sorties contrôlées, essais d’import interrompu et suppression/recréation.
- **Dépendances / risques :** chiffrement des données au repos implique la gestion d’une clé et une expérience de récupération ; ne le promettre que si cette gestion est réellement conçue.
- **État intermédiaire :** `docs/LOCAL_DATA.md` décrit l’emplacement par défaut et `FCU_DATA_DIR`, le contenu sensible, l’inspection des résumés et workflows, ainsi que des commandes de copie/suppression pour macOS, Linux et Windows. Le guide rappelle que `.env` est séparé, que les données ne sont pas chiffrées et qu’aucune purge automatique n’a lieu. Sur macOS/Linux, le chargeur d’environnement refuse un `.env` symbolique et retire les droits groupe/autres avant lecture ; le test subprocess vérifie le passage de `0644` à `0600`, l’absence de clé dans stdout/stderr et la préservation des droits de la cible symbolique. `tests/profile.test.ts` vérifie les imports invalides, 40 traces conservées malgré la limite d’affichage, suppression du répertoire après arrêt puis recréation d’un historique vide, préservation du profil si le système refuse le fichier temporaire, reprise après interruption simulée, refus des parents partagés/symboliques pour SQLite et refus des dossiers de données symboliques ou des racines partagées (9 tests). `TraceStore` crée le fichier SQLite en mode `0600` et n’altère plus les droits du parent arbitraire ; l’application sécurise séparément son dossier de données. Sur Chrome `154.0.8037.57`, `VariableResolver` masque les paramètres d’URL courants de type token/API key et les jetons Bearer avant le premier enregistrement de trace et le contexte fournisseur ; le dashboard filtre aussi les états et historiques restaurés, et `agent history` masque les URL anciennes. Les tests ciblés agent, UI et CLI le vérifient. `npm run check` passe ; les suites profils/résultats (10/10), CLI (3/3) et UI ciblée (2/2) passent. La validation locale macOS vérifie aussi les modes `0700` du répertoire local, du profil navigateur et des téléchargements, et `0600` pour SQLite, préférences navigateur et fichiers téléchargés. Ces filtres restent heuristiques et les captures réelles doivent être inspectées. Les permissions Windows/Linux et la rétention longue durée restent non vérifiées ; seule la cible macOS est revendiquée.

- **Jetons OAuth dans les fragments (24 septembre 2026) :** un test révélait que `#access_token=…` et `#code=…` n’étaient pas filtrés. Le filtre commun traite maintenant `#` comme séparateur de paramètres sensibles. La suite complète passe 100/100 après le correctif ; les vérifications ciblées unitaires, agent, dashboard et CLI passent 4/4 après ajout des cas de trace historique. Elles confirment l’absence des valeurs dans le premier enregistrement, le contexte modèle, les événements, l’état dashboard et l’historique CLI, tout en conservant le paramètre non sensible `state`.
- **Export/suppression sur macOS (24 septembre 2026) :** les commandes documentées `ditto` et `rm -r --` ont été exécutées dans un répertoire temporaire avec fichiers synthétiques ; les fichiers de sauvegarde correspondent, et l’initialiseur recrée un dossier vide après suppression. Node `25.9.0`, macOS `26.6`. Les 62 images existantes sous `assets/readme`, `artifacts/lab` et `artifacts/ui` ont été passées dans Tesseract : aucune chaîne reconnue au format d’une clé `sk-` ou d’un jeton Bearer. L’inspection visuelle de `assets/readme/results.png` confirme des données de facture synthétiques et aucun secret apparent. L’OCR ne détecte pas tous les secrets et les futures captures doivent être revues ; Les permissions Windows/Linux et la rétention longue durée restent non vérifiées.
- **Clôture validée le 24 septembre 2026 :** `FCU_BROWSER_CHANNEL=chrome ./node_modules/.bin/tsx --test --test-concurrency=1 tests/profile.test.ts tests/results.test.ts tests/cli.test.ts tests/agent.test.ts` passe **22/22** ; `tests/ui.test.ts` passe **11/11** séparément ; `npm run check` passe. Un regroupement antérieur a passé 32/33 avec un `502 /api/state` dans le smoke UI intégré ; le test UI complet repasse isolément après retrait de l’instrumentation temporaire, mais la cause du 502 reste inconnue (consignée en phase 4.1). `ditto` a exporté trois fichiers synthétiques avec empreintes identiques ; `rm -r --` puis `ensureDataDirectory` recrée un dossier vide en mode `0700`. Tesseract a contrôlé 62 images fixes et les 290 frames des deux GIFs du README ; aucune chaîne correspondant aux motifs `sk-` ou Bearer n’a été détectée, sans erreur de lecture. L’OCR reste heuristique ; données en clair et rétention manuelle sont documentées, et les permissions Windows/Linux restent non vérifiées.

### Phase 3 — Onboarding et expérience d’usage (P0)

#### 3.1 [x] Réussir un premier lancement sur une installation vierge

- **Objectif :** obtenir un premier résultat utile en quelques étapes compréhensibles.
- **Changements :** resserrer le quick start autour d’une seule installation supportée, du choix fournisseur, de l’ouverture de l’interface et d’une première tâche sandbox. Une option `FCU_BROWSER_CHANNEL` permet de sélectionner un Chrome/Edge déjà installé ; sa compatibilité doit être prouvée pour chaque couple Playwright/navigateur avant d’en faire le chemin recommandé. Garder la voie sans clé limitée au workflow déterministe du laboratoire.
- **Fichiers :** `README.md`, `src/cli/*`, `src/ui/*`, `.env.example`, `docs/PROVIDERS.md`, `docs/LOCAL_VALIDATION.md`.
- **Acceptation :** une personne n’ayant pas cloné le dépôt auparavant peut suivre le guide sur machine propre et distinguer le mode sandbox du mode nécessitant un modèle ; aucune étape ne dépend de configuration non documentée.
- **Validation :** répétition manuelle sur profil utilisateur vierge pour les OS annoncés ; conserver les commandes et erreurs rencontrées comme procédure de reproduction.
- **Dépendances / risques :** dépend de la matrice OS/Node et du diagnostic de phase 1.
- **Validation réalisée (23 septembre 2026) :** l’export propre du commit `eca3f17` s’installe avec `npm ci --offline --no-audit --no-fund` sans télécharger de navigateur. Après copie de `.env.example`, activation de `FCU_BROWSER_CHANNEL=chrome` et permissions `0600`, `agent doctor` démarre le navigateur sans fournisseur. `npm run dev -- --port 0` sert le tableau de bord en HTTP `200`. `ui:smoke` réussit sur un profil navigateur et un dossier de données neufs : la personne peut saisir URL et objectif au clavier, lancer avec Entrée, approuver le site au clavier, exécuter `Extract the table` sans clé (une action, zéro appel modèle), ouvrir le résultat au clavier puis fermer avec Échap ; l’oracle, l’aperçu, la console et les largeurs 1600/390 passent. Cela valide le premier parcours sur macOS `26.6`, Node `25.9.0`, Apple Silicon et Chrome système `154.0.8037.57`. Le minimum Node déclaré, les autres OS/navigateurs et les premières connexions live fournisseurs restent non vérifiés et suivent leurs tâches dédiées.

#### 3.2 [x] Clarifier permissions, exécution et résultats dans l’interface

- **Objectif :** aider à comprendre ce que l’agent s’apprête à faire, ce qu’il a fait et si l’objectif est réellement atteint.
- **Changements :** rendre visibles domaine approuvé, intention, action en attente, pause/annulation, reprise, vérifications et réparations ; présenter un échec de vérification comme un échec même si le navigateur a terminé sans exception.
- **Fichiers :** `src/ui/*`, `src/server/index.ts`, modèles de résultats, tests UI.
- **Acceptation :** chaque permission est contextualisée et révocable ; progression, attente utilisateur, erreur fournisseur, blocage sécurité et succès vérifié ont des états distincts ; annulation arrête les actions en attente.
- **Validation :** tests UI et smoke manuel de parcours avec refus, approbation, timeout et résultat incorrect.
- **Dépendances / risques :** utiliser les événements/résultats existants au lieu de créer une seconde machine d’état.
- **État intermédiaire (24 septembre 2026) :** `FCU_BROWSER_CHANNEL=chrome npm run ui:results` passe avec un planificateur local de test, sans preuve de planification par modèle. L’approbation précède toute visite du labo ; l’oracle vérifie le trajet et le fichier téléchargé ; les faits du résultat, le bouton de téléchargement visible, l’affichage plein écran et le viewer passent, sans erreur console ni débordement à 390 px. Le smoke sans clé couvre aussi l’approbation et l’ouverture/fermeture du résultat au clavier. `FCU_BROWSER_CHANNEL=chrome ./node_modules/.bin/tsx --test tests/ui.test.ts` passe 11/11 sur macOS `26.6`/Apple Silicon et Chrome système `154.0.8037.57`; `npm run check`, `tests/agent.test.ts` et `tests/security.test.ts` passent aussi (35/35 combinés). Les scénarios UI vérifient refus, arrêt pendant une approbation, timeout fournisseur simulé, résultat partiel après critère faux, révocation d’un domaine autorisé dont la requête fetch est bloquée avant d’atteindre la fixture locale, arrêt du run actif, ainsi que l’état `BLOCKED` lorsqu’un nom local est rejeté par la protection DNS avant visite. Le timeout est synthétique, sans requête réseau fournisseur. Le 24 septembre, smoke manuel interactif sur Chrome système avec fixtures locales et fournisseur synthétique : une approbation permet une extraction et l’ouverture du résultat (`Contact our team`) ; un refus laisse le navigateur sur `about:blank` et termine en `FAILED` ; le timeout synthétique après approbation apparaît dans le journal et termine en `FAILED` ; un critère faux après réparation affiche `Repaired task completion could not be verified` et termine en `FAILED`. Aucun appel à un fournisseur externe. Le test `unapproved cross-origin fetches are blocked before receiving a request` dans `tests/security.test.ts` passe 1/1 le 24 septembre : la requête secondaire n’atteint pas sa cible et l’extraction principale se termine. Les critères UI, annulation, permission révocable, blocage, succès vérifié, refus, timeout et résultat incorrect ont des preuves automatisées ou manuelles ; phase terminée. Aucun fournisseur externe n’a été appelé.

#### 3.3 [ ] Vérifier accessibilité et rendu multi-écran

- **Objectif :** rendre le CLI, l’interface et le site utilisables sur clavier et écrans courants.
- **Changements :** vérifier focus, labels, contrastes, tailles/scroll sur mobile et desktop, ainsi que les erreurs console du site et les captures actuelles du README.
- **Fichiers :** `src/ui/*`, `docs/index.html`, `lab/*`, scripts smoke UI/site, `assets/readme/*`.
- **Acceptation :** parcours principal réalisable au clavier ; aucune perte de contenu ou action hors écran aux largeurs retenues ; captures représentatives de l’interface réelle et à jour.
- **Validation :** smoke responsive aux largeurs 320, 390, 768 et desktop ; contrôle clavier et console ; tests automatisés des interactions prioritaires.
- **Dépendances / risques :** ne pas utiliser des maquettes ou des états synthétiques comme captures du produit.
- **État intermédiaire (23 septembre 2026) :** `FCU_BROWSER_CHANNEL=chrome npm run lab:smoke` passe sur Chrome système `154.0.8037.57` : 24 pages du labo, huit cartes de parcours, logo chargé et film local réellement lu en `1600x900`. Aucun débordement horizontal à 320, 390, 768 ou 1440 px sur les pages/parcours couverts ; aucune erreur console. Le smoke a rafraîchi 50 captures du labo et deux captures du tableau de bord sous `artifacts/`. Le 24 septembre, `FCU_BROWSER_CHANNEL=chrome npm run ui:smoke` vérifie aussi le tableau de bord à 320, 390, 768 et 1600 px : aucune barre de défilement horizontale, aucune erreur console, tâche sandbox terminée sans modèle ; les captures 320 et 768 ont été inspectées. Le smoke vérifie aussi les noms accessibles des commandes/champs visibles et les rapports de contraste WCAG AA (4,5:1 pour le texte courant, 3:1 pour le grand texte) sur le tableau de bord et son résultat. Le parcours principal passe au clavier, du formulaire au résultat. Le 24 septembre, les onglets « Real websites / Practice workflows » du labo ont reçu la navigation clavier gauche/droite avec boucle, Home/End, focus visible, tab stop unique et association `tabpanel`; `lab:smoke` les exerce sur Chrome et confirme aussi 24 pages, 8 cartes et zéro erreur console. Le parcours clavier complet du labo, les essais avec lecteur d’écran, le contrôle d’accessibilité des pages statiques et la revue des captures README restent ouverts. Les captures du labo montrent des fixtures synthétiques ; ne pas cocher.
- **Complément validé le 24 septembre 2026 :** sur macOS `26.6`, Node `25.9.0` et Chrome système `154.0.8037.57`, `npm run check` et `FCU_BROWSER_CHANNEL=chrome npm run lab:smoke` passent. Le smoke inspecte l’arbre d’accessibilité Chrome et les noms de contrôles sur 24 pages du labo, neuf pages historiques et la vitrine; il vérifie le contraste WCAG AA de leurs textes, les onglets clavier du labo et de la vitrine, le focus visible, la relation `tabpanel`, les erreurs console et les débordements. La vitrine est contrôlée à 320, 390, 768 et 1440 px; les pages du labo à 320, 390, 768 et 1440 px. Résultat : 34 pages, 730 occurrences de contrôles nommés dans les arbres AX, huit parcours de pratique et aucune erreur console. Le test a découvert et corrigé l’identifiant `#example-tabs` manquant sur la vitrine, qui empêchait son gestionnaire clavier de démarrer. La palette des textes de la vitrine et du labo a été assombrie pour satisfaire le seuil AA. `FCU_BROWSER_CHANNEL=chrome npm run ui:smoke` passe aussi après extraction du contrôle de contraste partagé : run sandbox `COMPLETED`, zéro appel modèle, aperçu chargé, clavier utilisable aux étapes couvertes, largeurs 320/390/768/1600 px et aucune erreur console. Les rendus actuels desktop/mobile de la vitrine et le GIF de run du README ont été inspectés localement.
- **Parcours clavier des filtres et cartes (24 septembre 2026) :** le smoke public parcourt `Real websites` et `Practice workflows`, revient avec `Home`, puis utilise `Tab` et `Entrée` pour Developer, Research et Everyday. Il vérifie `aria-pressed` et les résultats attendus (4, 4 et 2 cartes). Il tabule aussi les dix tâches réelles et atteint chaque résumé, bouton `Copy goal` et lien `Open starting page` avec focus visible; `Entrée` ouvre puis referme le premier résumé. Aucun lien externe n’est activé et le presse-papiers n’est pas modifié. `npm run check` et le smoke complet repassent.
- **Publication Pages vérifiée (24 septembre 2026, commit `aac10eb`) :** la page et sa feuille CSS publiques contiennent les changements poussés. Un smoke Playwright réel sur `https://othmaneblial.github.io/FreeComputerUse/` avec Chrome système vérifie 49 contrôles nommés, les contrastes AA et l’absence de débordement à 320/390/768/1440 px; le parcours clavier sélectionne les deux onglets et filtre quatre tâches Developer, sans erreur console.
- **Validation complémentaire (24 septembre 2026) :** `FCU_BROWSER_CHANNEL=chrome npm run lab:smoke` passe sur 34 pages avec 730 contrôles accessibles, huit cartes de pratique, les largeurs 320/390/768/1440 px, les onglets clavier actifs, le logo chargé et zéro erreur console. `FCU_BROWSER_CHANNEL=chrome npm run ui:smoke` termine le parcours sandbox avec une action et zéro appel modèle, vérifie les largeurs 1600/320/390/768 px, charge l’aperçu et ne signale aucune erreur console. La page Pages publique a été relue dans Chrome ; le README GitHub a été inspecté visuellement et dans l’arbre AX (titres, table, liens, vidéo et texte alternatif), avec zéro erreur console. Les captures desktop/mobile actuelles du laboratoire et du dashboard ont été inspectées ; les snapshots temporaires produits par les smokes ne sont pas conservés comme nouveaux assets.
- **Encore ouvert :** aucune annonce VoiceOver/NVDA ni aucun ordre vocal n’a pu être observé. VoiceOver a été activé temporairement depuis Réglages Système, puis restauré à « désactivé » ; l’outil ne rendait pas sa sortie parlée/caption panel vérifiable. Les preuves d’arbre AX et de navigation clavier ne remplacent pas ce contrôle vocal. La phase reste décochée jusqu’à une validation réelle avec lecteur d’écran.

### Phase 4 — Robustesse du code et validation reproductible (P0)

#### 4.1 [x] Stabiliser les tests et les critères indépendants

- **Objectif :** vérifier la justesse des effets, pas seulement l’absence d’exception.
- **Changements :** compléter les tests pour interruption, délais, réponses mal formées, retry, navigateur fermé, stockage interrompu, actions multi-étapes et workflow devenu incompatible. Garder des oracles indépendants sur les états/fichiers/données.
- **Fichiers :** `tests/*`, `scripts/*smoke*`, `artifacts/*` si rapports versionnés.
- **Acceptation :** les chemins critiques disposent de tests déterministes sans clé réseau ; tests live et coûts sont séparés ; échec partiel et flaky ne sont pas comptés comme réussite.
- **Validation :** `npm run check`, `npm test`, puis `npm run validate` après correction de la génération Pages ; rapporter précisément les échecs au lieu de les masquer.
- **Dépendances / risques :** les tests navigateurs peuvent être sensibles à la version Playwright ; épingler/enregistrer versions et diagnostiquer les flakiness.
- **État validé, 24 septembre 2026 :** le serveur conserve le même `Agent` et le même contexte Chromium entre tâches du tableau de bord, tout en ouvrant un onglet neuf à chaque tâche pour repartir sans le `sessionStorage` précédent. Le proxy réseau relit le mode courant pour appliquer le blocage des adresses privées après une tâche Ultra. Des régressions vérifient le même contexte durant le replay, les huit workflows du labo, la reprise après fermeture du dernier onglet et le retour du proxy au mode privé. `npm run check` passe et `FCU_BROWSER_CHANNEL=chrome npm test` passe 100/100 en série, sans clé fournisseur. `FCU_BROWSER_CHANNEL=chrome npm run validate` a passé la génération du labo, les types, les 97 tests présents dans ce run et le build ; j’ai arrêté le scan de tout l’historique après 2 min 30 sans résultat. Le scan du checkout courant passe (245 versions de fichiers) et l’audit npm séparé signale zéro vulnérabilité. Chrome système `154.0.8037.57`, macOS `26.6`, Node `25.9.0`. Chromium Playwright n’a pas été téléchargé. Le scan historique, le redémarrage autonome de Chrome sur un profil identique, les autres navigateurs et Windows/Linux restent non vérifiés.
- **Relances de la suite (24 septembre 2026) :** après l’ajout du scénario de redirection vers `file:`, une exécution complète a passé 99/100 : le long test dashboard a reçu une réponse locale `502`, puis a passé isolément. Deux exécutions complètes suivantes passent 100/100 (la plus récente en 179,5 s sur l’arbre courant). Le test dashboard enregistre désormais les chemins des éventuelles réponses HTTP 5xx. L’erreur unique n’a pas été reproduite, et sa cause n’est pas établie ; deux suites vertes ne prouvent pas l’absence de flakiness.
- **Nouvelle vérification propre (24 septembre 2026, commit `1ca1006`) :** un premier `npm run validate` après `npm ci --offline` a passé 100/101 tests ; le même scénario dashboard a reçu un `502` et l’assertion affichait seulement le message console Chrome. Le test vérifie maintenant d’abord les réponses HTTP 5xx et imprime leurs chemins. Le scénario ciblé passe 1/1, puis la porte complète propre passe 101/101 en 151,35 s ; une autre suite complète propre passe aussi 101/101. La cause du `502` initial n’a pas été reproduite ni identifiée ; garder ce risque visible et ne pas compter le run échoué comme une réussite.
- **Récurrence ciblée (24 septembre 2026) :** le regroupement des suites de données avec le smoke UI intégré passe 32/33 après un `502 /api/state`. Les suites pertinentes profils/CLI/agent/résultats repassent 22/22 ; `tests/ui.test.ts` passe 11/11 deux fois en exécution isolée sur le code rétabli. La cause du 502 reste inconnue : le run incomplet n’est pas compté comme réussite, et le risque intermittent reste ouvert.

#### 4.2 [x] Documenter et vérifier la plateforme réellement supportée

- **Objectif :** éviter que Node, Playwright ou SQLite natif échoue après installation selon la machine.
- **Changements :** choisir les versions Node et OS à supporter, puis vérifier installation des navigateurs, lancement headed/headless, stockage SQLite, permissions et arrêt propre sur chaque cible.
- **Fichiers :** `package.json`, lockfile, scripts setup/smoke, README, `docs/SUPPORT_MATRIX.md`.
- **Acceptation :** chaque cible publique passe depuis installation propre et reçoit une procédure précise ; toute cible non testée est marquée non vérifiée.
- **Validation :** exécution locale manuelle des smoke tests sur chaque OS retenu ; consigner OS, Node, navigateur et résultat.
- **Dépendances / risques :** environnement Mac actuellement utilisé ne prouve pas les parcours Windows/Linux ; aucun workflow GitHub Actions ne doit être réintroduit pendant cette tâche selon `docs/LOCAL_VALIDATION.md`.
- **Cible vérifiée (24 septembre 2026) :** macOS `26.6` Apple Silicon, Node `25.9.0`, Chrome système `154.0.8037.57`. Depuis un checkout propre, `npm ci --offline --no-audit --no-fund` puis `FCU_BROWSER_CHANNEL=chrome npm run validate` passent ; les tests headless couvrent navigateur, SQLite, profils, permissions et fermeture. `FCU_BROWSER_CHANNEL=chrome npm run demo -- --headed --contact` complète sept actions sur fixture locale, zéro appel modèle, sortie `0`, puis ferme Chrome. Aucun navigateur n’a été téléchargé. Le support effectivement validé se limite à cette cible : le plancher Node `22.13.0` déclaré par `engines`, les autres versions Node, Windows/Linux, Edge et Chromium Playwright restent explicitement non vérifiés dans `docs/SUPPORT_MATRIX.md` et le README.

#### 4.3 [x] Garder la validation compatible avec la contrainte CI actuelle

- **Objectif :** disposer d’une porte de qualité reproductible sans contredire la décision présente sur GitHub Actions.
- **Changements :** documenter l’ordre et la durée des contrôles locaux, les prérequis navigateur, les validations facturables opt-in, les critères bloquants et la génération d’artefacts de preuve. Toute proposition future de CI doit rester en attente d’une décision explicite du propriétaire.
- **Fichiers :** `docs/LOCAL_VALIDATION.md`, `package.json`, scripts de validation, éventuellement `docs/RELEASE_CHECKLIST.md`.
- **Acceptation :** une seule procédure locale exécutable décrit les contrôles et leurs sorties attendues ; aucun workflow n’est activé ou déclenché ; les validations live sont annoncées avant tout coût.
- **Validation :** revue de la procédure sur checkout propre puis exécution locale par le mainteneur au moment d’implémenter cette phase.
- **Dépendances / risques :** releases manuelles nécessitent discipline, archivage de logs et vérification par une seconde personne.
- **Validé sur checkout propre (24 septembre 2026, commit `1ca1006`) :** `npm ci --offline --no-audit --no-fund` ajoute les dépendances sans télécharger de navigateur. `FCU_BROWSER_CHANNEL=chrome npm run validate` passe ensuite en 157,19 s sur macOS `26.6`, Node `25.9.0` et Chrome système `154.0.8037.57` : génération labo, types, 101/101 tests en série, build, scan de l’historique (248 fichiers du worktree, 250 chemins et 948 blobs historiques uniques) et audit npm avec zéro vulnérabilité. Le rapport transitoire `100/101` dû au `502` est conservé à la tâche 4.1 ; deux suites complètes propres passent après le diagnostic du test. Aucun workflow GitHub n’est présent ou déclenché ; les benchmarks fournisseur restent opt-in et exclus de la porte. La couverture Windows/Linux, Node minimum et autres navigateurs reste ouverte en 4.2.

### Phase 5 — Documentation, présentation et contributions (P1)

#### 5.1 [x] Refaire le README autour d’une preuve rapide et d’une installation claire

- **Objectif :** faire comprendre en moins d’une minute le besoin résolu et le premier parcours.
- **Changements :** présenter proposition de valeur, GIF/vidéo réelle courte, installation, premier run, permissions locales, voies API/abonnement testées, limites, support, troubleshooting, benchmarks datés, lien site, sécurité et contribution.
- **Fichiers :** `README.md`, `assets/readme/*`, `docs/index.html`, `docs/SUPPORT_MATRIX.md`, `docs/PROVIDERS.md`.
- **Acceptation :** les commandes du README fonctionnent depuis un checkout propre ; liens et captures valides ; bénéfices chiffrés accompagnés de protocole, échantillon et date ; aucune intégration non vérifiée présentée comme prête.
- **Validation :** exécuter toutes les commandes d’installation/documentation sur environnement vierge et vérifier les liens locaux/externes.
- **Dépendances / risques :** la vraie vidéo n’arrive qu’en phase 8 ; jusque-là utiliser uniquement les captures/vidéos existantes dont le parcours montré a été confirmé.
- **Validé le 24 septembre 2026 :** le README ajoute le dépannage, les renvois Architecture/Contributing/Changelog et précise que le test STUN local ne prouve pas les autres trafics non HTTP. Depuis un clone temporaire du commit `fd86b50`, `npm ci --offline --no-audit --no-fund`, copie de `.env.example`, sélection de Chrome système, `chmod 600`, `npm run agent -- doctor` et `npm run dev -- --port 0` passent ; le navigateur démarre, le tableau de bord répond HTTP 200 et `.env` est en mode `0600`. Le contrôle de liens Markdown trouve 24 cibles, dont 21 locales sans cible cassée ; les quatre URLs Pages/labo/rapport/vidéo contrôlées répondent HTTP 200. Les assets hero SVG, GIF d’incident et JSON de preuve existent. La page GitHub publique affiche le commit `fd86b50`; le README et sa section Troubleshooting ont été vérifiés dans l’arbre d’accessibilité et à l’écran. Les intégrations non vérifiées restent explicitement étiquetées et les mesures gardent date, échantillon et limites.

#### 5.2 [x] Fournir les fichiers attendus d’un projet open source maintenable

- **Objectif :** rendre les contributions et retours plus faciles à traiter.
- **Changements :** ajouter `CONTRIBUTING.md`, guide de développement, modèle de bug avec infos anonymisées, demandes de fonctionnalité, consignes de sécurité et historique `CHANGELOG.md`. Définir les attentes de revue et une politique de support de versions.
- **Fichiers :** `CONTRIBUTING.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/*` ou formulaire équivalent, `SECURITY.md`, documentation d’architecture.
- **Acceptation :** une contribution peut installer, lancer les validations locales et ouvrir une issue sans deviner le format ; les modèles demandent versions et étapes reproductibles mais jamais clé, cookies ou données privées.
- **Validation :** suivre le guide comme nouveau contributeur et vérifier les liens / commandes.
- **Dépendances / risques :** ne pas créer de workflows d’automatisation GitHub tant que la contrainte de phase 4 reste active.
- **Validé le 24 septembre 2026 :** ajout de `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md` et des formulaires GitHub Bug/Feature, sans workflow. Les liens locaux des trois guides passent ; Ruby/Psych parse les deux YAML. `git archive` propre + `npm ci --offline --no-audit --no-fund`, `.env` en `0600`, `npm run agent -- doctor` et `npm run dev -- --port 0` → HTTP 200 passent sur macOS `26.6`, Node `25.9.0` et Chrome système `154.0.8037.57`. Les commandes de validation du guide sont couvertes par la porte locale 101/101 documentée en phase 4.3. `git tag --list` est vide et `npm view free-computer-use version` renvoie actuellement 404 ; le changelog distingue donc `Unreleased` d’une publication.

#### 5.3 [x] Consolider la présentation publique et la découverte

- **Objectif :** assurer une identité et des métadonnées cohérentes dans GitHub et Pages.
- **Changements :** harmoniser nom, logo, tagline, description, topics, image sociale, favicon, titre et métadonnées SEO ; relier repository, site, guide et release ; ajouter FAQ et cas d’usage concrets issus des scénarios vérifiés.
- **Fichiers :** métadonnées GitHub (mise à jour manuelle documentée), `README.md`, `docs/index.html`, `assets/readme/*`, `docs/USEFUL_EXAMPLES.md`.
- **Acceptation :** aperçu partageable lisible sur GitHub et réseaux ; exemples exécutables et étiquetés selon leur preuve ; aucun élément visuel ou compte à rebours de lancement ne suggère une fonction absente.
- **Validation :** inspection des métadonnées et aperçu social, parcours de liens depuis README vers Pages et retour.
- **Dépendances / risques :** les changements distants de description/topics ne sont pas compris dans la présente création de roadmap.
- **Validé le 24 septembre 2026 :** description et homepage GitHub relues via `gh`; 20 topics cohérents, dont `computer-use`. `docs/social-preview.png` (1200×630) est référencée par les métadonnées Open Graph/Twitter ; `docs/brand-mark.svg` sert de favicon. Pages déploie le commit `4efd20d1c79e1271a80975582a1232ab37e66257` avec succès (run `35944672601`) ; landing et image sociale répondent HTTP 200. Le README affiche le visuel de marque sur GitHub. La FAQ publique comporte quatre réponses fondées sur les capacités vérifiées. `lab:smoke` couvre 34 pages, 738 contrôles nommés, 8 cartes d’exercice, clavier et largeurs 320/390/768/1440 sans débordement ni erreur console ; le contrôle navigateur live confirme les mêmes points. `npm run validate` passe : 101/101 tests, build, audit de sécurité sans secret détecté et `npm audit` à zéro vulnérabilité.

### Phase 6 — Packaging et première release publique (P1)

#### 6.1 [ ] Publier d’abord un paquet npm reproductible

- **Objectif :** offrir une voie d’installation courte qui inclut réellement CLI, bibliothèque et UI.
- **Changements :** vérifier fichiers empaquetés, scripts compilés, permissions de l’exécutable, dépendances runtime, UI copiée, licence, versions et note de version ; définir la publication npm et les contrôles post-publication.
- **Fichiers :** `package.json`, lockfile, scripts de build/copy, `README.md`, `CHANGELOG.md`, `docs/RELEASE_CHECKLIST.md`.
- **Acceptation :** `npm pack --dry-run` contient seulement les fichiers nécessaires ; installation du tarball dans un projet temporaire permet d’exécuter `agent --help`, le diagnostic et le parcours local documenté ; les numéros correspondent ; registry renvoie la version publiée uniquement après publication effective.
- **Validation :** construire depuis checkout propre, inspecter l’archive, installer le tarball hors du dépôt et exécuter smoke CLI/UI ; vérifier ensuite la version publique et son intégrité.
- **Dépendances / risques :** ne pas publier de clé, fixtures sensibles, caches, rapports utilisateur ni fichiers incomplets ; publication npm est une action externe distincte.
- **Préparation vérifiée le 24 septembre 2026 :** `package.json` déclare description, dépôt, homepage, issues, mots-clés et types ; `docs/RELEASE_CHECKLIST.md` détaille les portes npm et GitHub. `npm run build` passe. `npm pack --dry-run --json` inclut 130 fichiers (1 135 380 octets compressés), dont CLI, bibliothèque, dashboard compilé, documentation et assets du README ; aucun `.env`, profil, base SQLite ou dossier de test. Installation offline du tarball dans un dossier temporaire : `agent --help`, `agent doctor` avec Chrome système, puis `Extract the table` sur la fixture publique synthétique réussissent avec une action et zéro appel modèle. Le dashboard du tarball répond HTTP 200 ; Chrome vérifie les champs nommés, les largeurs 320/390/768/1440 px et zéro erreur console. `npm view free-computer-use version` répond encore 404 : aucune version npm publique n’est déclarée, donc la tâche reste ouverte jusqu’à publication et vérification d’intégrité du registre.

#### 6.2 [ ] Produire des téléchargements installables et décider du format binaire

- **Objectif :** fournir un téléchargement direct sans annoncer un exécutable autonome qui ne fonctionne pas.
- **Changements :** tester la faisabilité d’exécutables autonomes face à Node `node:sqlite`, Playwright et à l’installation du navigateur ; choisir une première matrice réaliste. Fournir pour les cibles retenues des archives versionnées, avec installateur/bootstrap navigateur si nécessaire, checksums et instructions ; limiter les OS aux cibles effectivement éprouvées.
- **Fichiers :** nouveaux scripts `scripts/package-release.*`, `package.json`, `docs/RELEASE_CHECKLIST.md`, notes et assets de release.
- **Acceptation :** chaque fichier de release démarre depuis une machine propre de la cible indiquée, expose les mêmes permissions et diagnostics, et complète un smoke browser sandbox ; si le binaire autonome n’est pas viable, le téléchargement et sa dépendance Node/navigateur sont étiquetés clairement et aucune mention « standalone » n’est publiée.
- **Validation :** checksum SHA-256, inspection du contenu, test d’installation/exécution depuis un répertoire sans Node seulement pour les builds réellement autonomes, puis test sur chaque OS annoncé.
- **Dépendances / risques :** packaging peut révéler des incompatibilités runtime et faire grossir les fichiers avec les navigateurs. Commencer par un spike et réduire la matrice au lieu de publier des builds non vérifiés.
- **Décision de faisabilité (24 septembre 2026) :** ne pas fabriquer de binaire autonome ni embarquer Chromium. Le runtime utilise `node:sqlite` et Playwright ; le navigateur Chromium associé à Playwright n’est pas installé. Seul macOS 26.6/Apple Silicon avec Node 25.9.0 et Chrome système 154.0.8037.57 est vérifié. Le tarball npm léger de 1 135 380 octets s’installe et passe `doctor`/le parcours sans modèle sur cette cible, sans téléchargement de navigateur ni Docker. La voie cohérente est une archive npm étiquetée avec ses prérequis Node/navigateur et checksums, une fois la version publiée. Aucun binaire ou asset public n’existe encore : tâche ouverte jusqu’à la release et au smoke de l’asset téléchargé.

#### 6.3 [ ] Créer une release versionnée et contrôlable

- **Objectif :** rendre l’état publié identifiable et reproductible.
- **Changements :** préparer version, tag, notes, sources, paquet npm et archives validées ; consigner versions Node/Playwright/modèles utilisés dans les preuves ; documenter rollback et support des issues.
- **Fichiers :** `CHANGELOG.md`, `package.json`, lockfile, `docs/RELEASE_CHECKLIST.md`, release GitHub et tags.
- **Acceptation :** tag et release correspondent au commit validé ; assets téléchargés ont les checksums publiés ; instructions d’installation fonctionnent avec les assets réels ; aucune version n’est appelée publiée avant vérification GitHub/npm.
- **Validation :** refaire les smoke tests sur les fichiers téléchargés, inspecter la page release et vérifier les registres publics après publication.
- **Dépendances / risques :** dépend des phases 0 à 5 et du succès de packaging ; la release, l’upload et la publication npm sont des étapes distinctes à vérifier séparément.

### Phase 7 — Intégration écosystème et croissance mesurable (P2)

#### 7.1 [ ] Évaluer une intégration MCP locale

- **Objectif :** rendre les capacités accessibles depuis des clients d’agents courants sans leur transférer implicitement tous les contrôles du navigateur.
- **Changements :** concevoir un serveur MCP local limité aux opérations utiles (inspecter, lancer une tâche autorisée, suivre/vérifier le résultat) ; conserver l’approbation par site, limites d’actions et arrêt ; documenter configuration client, transport et confidentialité.
- **Fichiers :** éventuel `src/mcp/*`, `src/server/*`, `src/actions/policy.ts`, docs d’intégration et tests sécurité.
- **Acceptation :** intégration de référence locale fonctionne avec un client identifié ; appels refusés restent refusés par la même policy ; le serveur n’ouvre aucun endpoint réseau non documenté et n’expose aucune clé.
- **Validation :** tests de protocole avec client simulé, tests négatifs et essai manuel sur un client réellement supporté.
- **Dépendances / risques :** attendre la stabilité du contrat providers/permissions ; l’intégration élargit la surface d’attaque et ne doit pas devenir un simple tunnel d’actions arbitraires.

#### 7.2 [ ] Fermer la boucle de retours et mesurer l’adoption

- **Objectif :** transformer les retours initiaux en améliorations prioritaires.
- **Changements :** publier des exemples vérifiés, annoncer les limites connues, trier issues selon blocages d’installation/provider/sécurité et suivre périodiquement installations, téléchargements, contributeurs et tâches reproduites sans collecter de télémétrie cachée.
- **Fichiers :** `README.md`, exemples, GitHub Discussions/Issues, `docs/*`.
- **Acceptation :** chaque irritant important reçoit une issue liée à un critère ; retours privés ne sont pas publiés sans consentement ; aucune métrique utilisateur n’est collectée sans choix explicite.
- **Validation :** revue mensuelle des issues et des données publiques de release, avec date et méthode.
- **Dépendances / risques :** adoption initiale faible est possible ; ne pas instrumentaliser les étoiles ni promettre qu’une roadmap les fera augmenter.

### Phase 8 — Vidéo finale de démonstration réelle (dernière phase, obligatoire)

Cette phase ne commence qu’après l’implémentation et la validation des phases 0 à 7, une release effectivement disponible et des parcours annoncés qui fonctionnent depuis les fichiers publiés. Employer la skill **`ffmpeg-video-editor`** pendant la production. Aucune vidéo finale ne doit être tournée ou montée avant cette porte de sortie.

#### 8.1 [ ] Préparer et capturer un parcours complet du produit publié

- **Objectif :** prouver visuellement le problème résolu, le démarrage et les fonctionnalités principales réellement livrées.
- **Changements :** démarrer depuis la procédure d’installation publiée, configurer une connexion réellement supportée, lancer une tâche sandbox, montrer l’approbation du site, l’inspection/action, la vérification indépendante et, si validée, la répétition de workflow sans nouvel appel modèle. Capturer l’écran réel et garder les journaux, versions et artefacts de preuve privés nettoyés de tout secret.
- **Fichiers :** capture source conservée hors dépôt ou dans espace de production contrôlé, `assets/readme/demo.mp4`, capture et rapports existants comme référence seulement.
- **Acceptation :** la vidéo montre un run réel sur le produit publié, le problème d’origine, le démarrage/installation, le flux principal et son résultat ; aucun mockup, écran fictif, résultat simulé ou affirmation sans preuve.
- **Validation :** rejouer le parcours une fois avant capture ; confirmer que l’enregistrement correspond au run et que clés, cookies, adresses privées et données personnelles ne sont pas visibles.
- **Dépendances / risques :** disponibilité d’un fournisseur valide et coût prévu ; garder la tâche dans une sandbox et prévoir une capture de reprise si le service externe échoue.

#### 8.2 [ ] Monter, exporter et vérifier les versions finales

- **Objectif :** produire une vidéo propre pour README/GitHub et une déclinaison courte pertinente.
- **Changements :** avec `ffmpeg-video-editor`, faire un montage professionnel au rythme lisible : coupes propres, titres sobres, zooms/cadrages utiles, sous-titres si voix, niveaux audio propres ; exporter un master 16:9 adapté au README/GitHub et, si utile, une version courte verticale ou carrée pour réseaux. Conserver les sources et la commande/projet de montage.
- **Fichiers :** `assets/readme/demo.mp4`, éventuellement `assets/readme/demo-short.mp4`, README et image/GIF d’aperçu si nécessaire.
- **Acceptation :** montage fidèle à la capture, lisible sans contexte externe, sans cacher les étapes de permission/échec ; audio intelligible ou retiré proprement ; encodage, résolution, fréquence, durée et poids adaptés aux limites de diffusion choisies.
- **Validation :** inspecter les métadonnées avec `ffprobe`, décoder intégralement chaque export avec FFmpeg vers null, écouter/visionner l’intégralité et contrôler les coupes, sous-titres, niveaux audio, secrets et synchronisation ; vérifier l’asset affiché depuis le README.
- **Dépendances / risques :** phase terminale ; si une fonction change après tournage, refaire la capture concernée et revalider tous les exports avant de garder la vidéo en page d’accueil.

## Conditions de sortie

Le projet peut être présenté comme une release stable quand les phases 0 à 6 sont terminées, les parcours supportés sont reproductibles, les limites de fournisseurs et OS sont publiées et les assets réellement téléchargeables ont été testés. La phase 7 est une extension d’adoption ; elle ne doit pas retarder une première release sûre. La vidéo publique finale vient en dernier, après vérification des phases précédentes, et ne sert jamais à remplacer leurs preuves.

À l’issue complète de cette roadmap, un nouvel utilisateur pourra installer le produit depuis une voie publiée et testée, choisir un fournisseur dont le support est prouvé, comprendre les permissions avant l’exécution, inspecter un résultat vérifié, contribuer avec des consignes claires et voir une démonstration fidèle au produit livré.
