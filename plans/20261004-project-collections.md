# Collections de projets dans la sidebar v2

Demande d'origine : ranger ses projets dans des conteneurs repliables (un « Dibsteur » qui regroupe tous les repos Dibsteur). Besoin récurrent : #1176, #2008, #2745, #4018 (SUPER-1511). La PR #5981 en fait une version locale ; celle-ci va plus loin et suit le modèle que main a retenu pour les groupes de workspaces (#6990, #6999, #7055, #7194).

## Principe

**Une collection est un tag posé sur un projet**, enregistré sur l'hôte et personnel à chaque utilisateur, comme un groupe de workspaces est un tag posé sur un workspace. La présentation (nom affiché, couleur, ordre par défaut) vit sur l'hôte ; le repli, le masquage et l'ordre manuel restent locaux, comme aujourd'hui.

Conséquences voulues :
- la CLI, le MCP et les automatisations peuvent ranger un projet sans l'interface ;
- deux projets sur deux hôtes rangés sous le même tag tombent dans la même collection ;
- un collègue qui partage un hôte ne voit pas les collections des autres (#7194) ;
- aucune identité par URL de remote (`plans/20260716-local-first-projects.md`).

Vocabulaire : « Collection » dans l'interface et la CLI. « Group » et « folder » restent aux groupes de workspaces.

## Ce que voit l'utilisateur

```
PROJECTS
▾ ● Dibsteur              
    ▸ dibsteur-back
    ▾ dibsteur-front
        feat/login
    ▸ dibsteur-mobile
▸ ● Perso                 2
▸ superset
▸ roger
```

- Une collection est une ligne repliable au niveau des projets, avec une pastille de couleur, son nom, et le nombre de projets quand elle est repliée. Elle ne s'imbrique pas.
- Création : « New collection » dans le menu d'ajout de l'en-tête PROJECTS, et « Move to collection ▸ New collection… » dans le menu d'un projet. Une nouvelle collection passe directement en renommage inline.
- Menu d'une collection (clic droit et bouton « … ») : Rename, Color, Delete collection. Supprimer remet ses projets à la racine, à la place de la collection et dans leur ordre ; aucun projet n'est supprimé.
- Menu d'un projet : « Move to collection ▸ » (collections existantes, New collection…, Remove from collection).
- Glisser-déposer : réordonner collections et projets racine entre eux, déposer un projet sur une collection pour l'y ranger, réordonner dans une collection, sortir un projet en le déposant à la racine. Désactivé pendant un filtre, comme aujourd'hui.
- Un projet est dans au plus une collection.
- **Dépliage automatique** : naviguer vers un workspace (clic, raccourci, lien, notification) dont la collection est repliée la déplie. Les raccourcis précédent/suivant traversent les collections.
- **Tri** : en tri « manual », l'ordre manuel vaut partout. En tri « active » ou « created », les projets d'une collection sont ordonnés par l'activité ou la création de leur workspace le plus récent ; la racine garde son ordre manuel, comme main le fait déjà pour les projets.
- **Masquer les collections vides** : option dans le menu de tri et d'options de l'en-tête PROJECTS, désactivée par défaut, persistée dans les préférences utilisateur. Une collection est vide si aucun de ses projets n'est visible (projets masqués compris).
- Filtre : une collection apparaît si son nom ou un de ses projets correspond ; elle se déplie pour l'affichage sans changer son repli enregistré.
- La lane Pinned ne change pas.
- Corrections par rapport à #5981 : accessibilité des contrôles d'état (`aria-pressed`, `aria-expanded`), déplacement de plusieurs projets en une seule écriture par hôte, et pas de couleur au survol qui écrase la couleur choisie.

## Hôte (`packages/host-service`)

- Nouvelle table `project_tags(project_id, tag, created_by_user_id)` : PK sur les trois colonnes, FK vers `projects` avec suppression en cascade, index sur `tag`, créateur inconnu stocké `''`. Même normalisation et mêmes limites que `workspace_tags` (`packages/shared/src/workspace-tags.ts`). Migration générée par `drizzle-kit generate` depuis le package, jamais écrite à la main.
- Présentation : `tag_folder_settings` avec le nouveau scope sentinelle `projects`, à côté de `sessions`. Supprimer un projet ne touche pas aux réglages `projects`.
- `project.list` renvoie en plus `tags`, filtrés pour l'utilisateur courant comme `workspace.list` (forme du tableau inchangée, champ additionnel).
- Nouvelle procédure `project.setTags({ projectId, tags })` qui remplace les tags de l'utilisateur courant et préserve ceux des autres, comme `workspace.update`. `project.update` ne change pas.
- `project:changed` porte de quoi recalculer la vue personnelle sans diffuser à tous la vue filtrée de l'acteur (même solution que `tagAssignments` pour les workspaces, ou invalidation puis relecture).
- Tests : isolement entre utilisateurs, créateur inconnu, cascade à la suppression d'un projet, normalisation, scope `projects`.

## CLI (`packages/cli`)

- `superset projects update <projectId> --collection <nom>` range le projet, `--clear-collection` le sort ; refus si les deux sont donnés. Même résolution d'hôte (`--host`, `--local`) que `projects list`.
- `superset projects list --collection <nom>` filtre, et la sortie JSON inclut `tags`.

## Desktop (`apps/desktop`)

- `useHostProjects` normalise, fusionne entre répliques (union des tags d'un même projet sur plusieurs hôtes) et met à jour `tags` sur événement.
- Un dériveur pur des collections, sur le modèle de `workspaceTagFolders` : union des tags de projets et des réglages `projects` de tous les hôtes connus (une collection vide reste visible sur un autre appareil), fusion par tag, règle de priorité des réglages entre hôtes identique à `useHostTagFolders.utils.ts` (local d'abord, puis machineId), un seul conteneur par projet (ordre le plus faible, puis tag).
- Placement local : repli, ordre manuel des collections et des projets dans la liste racine et dans chaque collection, persistés à côté des placements existants. Toute nouvelle clé localStorage respecte `apps/desktop/AGENTS.md` (bornée, inscrite, nettoyage).
- Écritures : ranger, sortir, déplacer plusieurs projets, créer, renommer, colorer, supprimer, avec mise à jour optimiste et rollback. Ranger un projet écrit sur chaque hôte qui le sert ; la création écrit la présentation sur les hôtes connus, le renommage et la couleur seulement sur ceux qui portent ou portaient la collection, par un réglage ou par les tags de leurs projets (instantané projets inclus). La fusion du seul scope `projects` choisit le réglage dont `updatedAt` est le plus récent ; à égalité ou sans date, le local puis le `machineId` départagent comme avant. Les groupes de workspaces gardent leur règle actuelle. Une couleur reprend le nom et l'ordre de présentation les plus récents connus, sans exporter l'ordre manuel local. Une mutation porte une seule date auteur, au moins supérieure aux dates déjà vues, sur tous ses hôtes. L'appareil auteur garde en SQLite les présentations des hôtes non prêts (128 entrées par hôte, organisation et utilisateur) et les rejoue au retour, une écriture à la fois entre les mutations utilisateur. Une création en attente garde sa date de création originale même après renommage ou recoloration. Le rejeu transmet chaque présentation datée même si le cache renderer contient déjà cette date. Une procédure additive côté hôte vérifie la date dans la transaction : il n'écrase jamais une date égale ou plus récente et ne recrée un réglage absent que pour une création postérieure aux suppressions connues. Les suppressions du scope `projects` portent la même date auteur que les présentations, conservée dans la file SQLite et transmise par le champ optionnel `deletedAt` lors du rejeu. L'hôte conserve cette date sans la remplacer par l'heure de réception et ignore une suppression si le réglage est plus récent. Les clients sans date gardent la datation monotone par l'hôte. Les suppressions gardent une trace par utilisateur et tag sur l'hôte ; elles ne sont pas des réglages visibles. Le registre conserve les 1 024 suppressions les plus récentes par utilisateur du scope `projects`, purgé dans la transaction lors des écritures. Une création encore en file après éviction de sa trace de suppression peut donc recréer la collection. Une nouvelle présentation remplace l'ancienne ; présentation et suppression en attente s'annulent pour la même paire hôte/tag selon l'ordre des mutations. Aucun appareil ne pousse ses réglages locaux aux autres sur simple divergence. Les présentations anciennes sans date et les hôtes sans procédure de rejeu de présentation sont acquittés sans écriture, pour ne pas contourner la protection. Les suppressions déjà en file avant l'ajout de la date restent datées par l'hôte, comme les clients publiés. Un refus définitif abandonne l'entrée ; une erreur transitoire la conserve et laisse traiter les autres hôtes, avec un délai exponentiel de 1 à 60 secondes. Un acquittement ne relance pas la file, une invalidation par hôte termine le rejeu sans attendre les relectures. Le patch optimiste couvre aussi les hôtes non prêts et reste séparé des lectures canoniques utilisées par le rejeu.
- Hôte ancien sans `project.setTags` ni `tags` : `tags` vaut `[]`, les actions de rangement sont désactivées pour ce projet, sans erreur.
- Composants co-localisés sous `DashboardSidebar/components/`, un dossier par composant ; la ligne de collection s'appuie sur `DashboardSidebarGroupHeader`.
- Chaînes Lingui, `bun run check:i18n`, traductions écrites dans chaque locale.

## Mobile (`apps/mobile`)

Ajouté à la demande de Louis le 2026-10-04, dans la même PR. Le mobile lit déjà ses projets sur l'hôte sélectionné (`project.list`) : il lit les collections au même endroit, la synchro avec le desktop et la CLI vient avec, sans cloud.

- Accueil : les sections projets de l'hôte sélectionné sont regroupées sous des en-têtes de collection (pastille de couleur, nom, nombre de projets quand repliée). Une collection prend la place de son premier projet dans l'ordre actuel du mobile ; ses projets gardent cet ordre. Les workspaces cloud ne changent pas.
- Données : `tags` de `project.list` et réglages `tag_folder_settings` du scope `projects` de cet hôte (nom affiché, couleur), avec la même dérivation que le desktop (un conteneur par projet), partagée plutôt que recopiée quand c'est possible.
- Repli des collections : local à l'appareil, persisté comme le repli actuel des projets.
- Appui long sur un projet : « Move to collection » (collections existantes avec une coche sur l'actuelle, New collection… qui demande un nom, Remove from collection). Écrit `project.setTags` sur l'hôte, et pour une nouvelle collection le réglage `projects` (nom affiché), avec le même tag que le desktop créerait pour ce nom. L'unicité du tag n'est vérifiée que sur l'hôte sélectionné : une collection du même nom qui n'existe que sur un autre hôte est rejointe plutôt que doublée.
- Renommer, colorer, supprimer et réordonner restent au desktop et à la CLI.
- Hôte ancien sans `project.setTags` ni `tags` : pas de collections, action absente, sans erreur.
- Chaînes traduites comme le reste du mobile ; vérification sur simulateur avec des données fictives.

## Hors périmètre

Sidebar v1, gestion complète des collections sur mobile (renommer, couleur, supprimer, ordre), collections imbriquées, icône ou image de collection, tri alphabétique (n'existe pas dans main), partage de collections entre membres, configuration commune à une collection (env, MCP, presets : #4018), projets multi-repos (#7699).

## Livraison

Une PR vers main, qui cite #5981, #4018 et SUPER-1511.
