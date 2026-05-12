# Structure du projet

## Racine

- `index.html` : point d'entree principal du site.
- `.gitignore` : fichiers ignores par Git.

## `assets/`

Images, favicons et polices utilises par l'interface et les exports.

## `data/`

- `cards.json` : donnees chargees par le board en production/demo.
- `snapshots/` : exports JSON et etats de reference conserves pour test ou reprise.

## `docs/qa/`

Sources QA, rapports de demo et documents utiles au suivi fonctionnel.

## `src/`

Code JavaScript de l'application.

- `app/` : controleurs UI et orchestration des interactions.
- `core/` : chargement, normalisation et gestion d'etat.
- `services/` : exports, PDF, rapports et simulation.
- `ui/` : rendu HTML et composants.
- `utils/` : constantes et helpers generiques.

## `styles/`

Feuilles CSS de l'application.

- `base.css` : styles historiques et base globale.
- `minimal-cards.css` : point d'entree CSS qui importe les fichiers decoupes.
- `minimal-cards.01-foundations.css` : variables, polices, layout global et header.
- `minimal-cards.02-layout.css` : sections, pages et grilles.
- `minimal-cards.03-components.css` : composants QA et controles.
- `minimal-cards.04-dark-mode.css` : theme sombre.
- `minimal-cards.05-responsive.css` : adaptations responsive.

## `test/`

Page HTML de test qui reutilise les memes assets, styles et scripts que le site principal.
