# USMLE Step 1 — plan 12 semaines

Application web (Next.js) de préparation à l'USMLE Step 1 : un programme de 12 semaines
découpé en séquences fléchées, branché sur les tags du deck **AnKing Step 1** et sur tes
propres cours **First Aid** en PDF.

## Ce que fait l'appli

- **Séquence hebdomadaire fléchée**, dans l'ordre de travail recommandé :
  vidéo (si besoin) → lecture First Aid → questions UWorld par système →
  annotation de First Aid → révision Anki quotidienne.
- **Recherches Anki prêtes à coller** sur chaque étape, par exemple
  `tag:#AK_Step1_v12::#FirstAid::*Cardiovascular*`. Un clic copie la recherche ; dans Anki,
  `Ctrl+A` puis `Ctrl+J` désuspend les cartes affichées. Les motifs utilisent des jokers, donc
  ils résistent à la renumérotation des chapitres ; un sélecteur bascule le préfixe entre
  `#AK_Step1_v12` et `#AK_Step1_v11`.
- **Glisser-déposer** : réordonner les étapes d'une semaine, ou déplacer une étape vers une
  autre semaine. L'agencement est mémorisé.
- **Cours en PDF, gardés en local** : un fichier pour First Aid, un pour Pathoma, et
  éventuellement un PDF par chapitre attaché à une étape précise. Les étapes de lecture et les
  étapes vidéo Pathoma ouvrent le bon fichier à la page enregistrée, et remplacent alors le
  lien externe.
- **Suivi** : progression globale, avancement par semaine, scores NBME des semaines 8, 10 et 12.

## Confidentialité des données

Tout est local. La progression, l'ordre des étapes et les numéros de page sont dans
`localStorage` ; les PDF sont conservés dans **IndexedDB**, sur l'appareil. Aucune donnée ni
aucun fichier n'est envoyé à un serveur, et rien n'est versionné dans ce dépôt — ton exemplaire
de First Aid reste chez toi.

Corollaire : les données sont attachées à un navigateur et à un appareil. Vider les données du
site efface la progression et les PDF joints.

## Développement

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # build de production
pnpm typecheck
```

## Déploiement sur Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importer ce dépôt GitHub.
2. Framework détecté automatiquement : **Next.js**. Aucune variable d'environnement,
   aucune commande de build à personnaliser.
3. Déployer. Chaque push sur `main` redéploie la production ; les autres branches
   obtiennent une URL de prévisualisation.

L'appli est installable sur téléphone (manifest + icônes) : ouvrir l'URL Vercel, puis
« Ajouter à l'écran d'accueil ».

## Structure

| Chemin | Rôle |
| --- | --- |
| `lib/usmle-plan.ts` | Programme des 12 semaines, étapes, cibles de tags AnKing |
| `lib/usmle-pdf-store.ts` | Stockage local des PDF (IndexedDB) |
| `components/usmle-step1-planner.tsx` | Interface : séquences, glisser-déposer, suivi |

## Note sur les tags AnKing

L'arborescence de référence utilisée ici (`#Pathoma`, `#B&B`, `#FirstAid`, `#SketchyMicro`,
`#SketchyPharm`, `^Systems`, `^Other::^HighYield`) provient d'un export réel du deck en v11 ;
la numérotation des chapitres a évolué en v12, d'où l'usage systématique de jokers. Si une
recherche ne renvoie rien, le nom exact du namespace se lit dans la barre latérale du
navigateur de cartes d'Anki, et se corrige dans `lib/usmle-plan.ts`.
