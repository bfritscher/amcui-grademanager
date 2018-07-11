# Grade : attribution des notes

Ce chapitre est dédié à l&#39;association des copies avec les étudiants et à la correction de l&#39;examen.

## Ajout des étudiants dans le projet

Maintenant que les feuilles de réponses sont uploadées dans le système, nous pouvons accéder à l&#39;onglet **« grade »**. Récupérez le fichier CSV qui vous est fourni par l&#39;école et assurez-vous bien que les en-têtes possèdent au minimum un en-tête nommé **« name »** celle-ci est obligatoire.

À la Figure 43 un exemple de fichier CSV que nous allons utiliser dans ce tutoriel notez toutefois qu&#39;il n&#39;est pas obligatoire d&#39;ajouter le champ **« id »,** car celui-ci est généré automatiquement. Si vous avez vos propres identifiants pour les étudiants alors, utilisez un en-tête ID.

Il suffit ensuite de copier-coller votre liste CSV dans la barre de l&#39;onglet **« grade »**.  Ouvrez votre fichier CSV avec un autre outil qu&#39;Excel. Vous pouvez utiliser un éditeur de texte comme notepad ++ par exemple. Cela vous permettra d&#39;afficher la liste d&#39;étudiant avec le séparateur point-virgule. Copier-coller le tout dans la partie supérieure de l&#39;application (Figure 43).

 ![students_excel](./assets/students_excel.png)

 ![students_csv](./assets/students_csv.png)



 ![students_import](./assets/students_import.png)

Figure 44 Ajouter les étudiants dans l&#39;application

Une fois que vous avez importé votre liste d&#39;étudiant dans le champ dédié, à cet effet cliquez sur le bouton **« add to students »**. Cela va afficher les étudiants insérés dans le tableau de note (Figure 45). Nous allons donc pouvoir commencer l&#39;association entre les copies et les étudiants !

 ![grade_no_match](./assets/grade_no_match.png)

Figure 45 Tableau des notes

## Association des copies avec les étudiants

Nous constatons maintenant que les étudiants Nunes et Marshall sont bel et bien présents dans le tableau de note disponible dans l&#39;onglet **grade** (Figure 45). On voit aussi les deux copies que nous avons uploadées depuis l&#39;onglet scan, elles indiquent **« manual match »** qui signifie en français « correspondance manuelle ».

Cliquer sur **« manuel match »** pour commencer l&#39;association des copies avec les étudiants. Une fenêtre va alors apparaître et va vous afficher la case comportant le nom et le prénom de l&#39;étudiant (Figure 46). Au bas de cette fenêtre, vous aurez accès aux noms des étudiants (les informations contenues dans l&#39;en-tête **« name »** ). Le but du jeu est de tout simplement matcher les copies avec les noms correspondants. Souvenez-vous, dans le chapitre précédent nous avons ajouté des en-têtes **id, name et firstname****. **Seul l&#39;en-tête** name **est obligatoire, vous pouvez également ajouter le prénom dans l&#39;en-tête** name** pour que l&#39;application affiche directement le nom et prénom de l&#39;étudiant. Dans notre cas, nous avons séparé les en-têtes donc nous n&#39;aurons que le nom qui s&#39;affiche dans l&#39;élément en dessous de la fenêtre (ce n&#39;est pas très grave, nous n&#39;avons que deux étudiants dans notre exemple !).

Faites attention à bien choisir le bon élève du premier coup, sinon il faudra réinitialiser les informations du projet pour renouveler l&#39;association.

 ![manual_match](./assets/manual_match.png)

Figure 46 Association copie/étudiant

 ![manual_match_done](./assets/manual_match_done.png)

L&#39;application va automatiquement passer en revue toutes les copies n&#39;ayant pas encore d&#39;association. Lorsque vous avez passé en revue toute les copies à associer la boîte modale vous alerte que chaque copie à bien une correspondance.

Complétez donc les associations et admirez le résultat dans le tableau de note (Figure 48).

 ![grade_matched](./assets/grade_matched.png)

Figure 48 Tableau de note avec copies associées

Les copies ont maintenant été associées à chaque étudiant et nous avons à disposition la note obtenue pour chaque étudiant. Vous pouvez si vous le souhaitez adapter le barème dans l&#39;élément **« point »** pour par exemple offrir des points bonus.

Vous avez également la possibilité, dans la partie droite du tableau, de cliquer sur **« show all »** pour avoir accès au détail des questions et ainsi voir le résultat de l&#39;étudiant pour chaque question. En cliquant sur un détail de question pour une ligne (donc un élève), vous serez automatiquement redirigé vers la feuille de réponse de l&#39;étudiant en question.

## Vérification manuelle d&#39;une copie

Redirigez-vous vers la feuille de réponse en cliquant sur le nombre de points obtenus à la question lorsque vous avez des doutes (Figure 48). Des avertissements vous aident en signalant qu&#39;il faudrait peut-être revoir manuellement une copie.

Voici le résumé simplifié des paramètres (ils se trouvent justes en dessous du tableau, Figure 49).

 ![grade_legend](./assets/grade_legend.png)

Figure 49 Alerte du tableau de notes

Lorsque la cellule est en rouge, cela signifie que l&#39;étudiant

- --à cocher plusieurs cases sur une question à choix simple
- --à cocher la case « aucune de ces réponses n&#39;est correcte » ET une ou plusieurs autres cases sur une question à choix multiple

Lorsque la cellule est en jaune cela signifie que l&#39;étudiant n&#39;a coché aucune réponse (ou peut-être que le seuil de noir était trop élevé et l&#39;application n&#39;a pas détecté la case)

Lorsque la cellule est en violet clair, cela signifie que la note plancher est atteinte.

N&#39;hésitez pas à faire une vérification manuelle lorsque vous êtes redirigé vers la feuille de réponse scannée. Vous pouvez cliquer sur une case bleue pour la rendre détectable ou cliquer sur une case rouge pour que l&#39;application ne la détecte plus (Figure 50).

 ![scan_manual_check](./assets/scan_manual_check.png)

Figure 50 Vérification des réponses

Dans la figure ci-dessus les carrés entourant les cases à cocher possèdent des traits pleins. Si vous cliquez sur un des carrés, les traits changeront de couleur et le contour sera discontinu. Une couleur rouge signifie que l&#39;application a bien détecté une case comme étant cochée, une couleur bleue signifie que l&#39;application n&#39;a pas détecté la case comme étant cochée.

## Annotation des copies (options)

Avant de lancer l&#39;annotation automatique des copies, vous pouvez configurer quelques paramètres pour que l&#39;annotation satisfasse au mieux vos besoins. Rendez-vous donc dans l&#39;onglet **« options »** dans la sous-section **« annotation »** (Figure 51).

 ![options_annotate_filename](./assets/options_annotate_filename.png)

Par défaut l&#39;ID est remplacé par la colonne **name** du fichier CSV que vous avez importé. La première partie est utilisée pour nommer le fichier annoté qui sera généré.

Vous pouvez ajouter d&#39;autres informations. Cliquer simplement sur les boutons gris qui se situent au bas de la sous-section pour ajouter les informations que vous désirez avoir sur la fiche.

 ![option_annotate_page](./assets/option_annotate_page.png)

La deuxième partie du paramétrage concerne l&#39;affichage de la note sur les copies annotées. Par défaut, l&#39;application va afficher l&#39;ID de l&#39;étudiant (son nom), la note de l&#39;étudiant ainsi que le nombre de points obtenus sur le nombre total de points. Vous pouvez modifier l&#39;affichage de ses informations en ajoutant de nouvelles informations en cliquant sur les attributs en dessous de la sous-section.

 ![pdf_annotate](./assets/pdf_annotate.png)

 Dans ce tutoriel nous avons déjà affiché le nom et le prénom de l&#39;étudiant sur la fiche, nous ne rajouterons pas de nouvelles informations sur la copie annotée.

 ![option_annotate](./assets/option_annotate.png)

Nous voulons maintenant afficher le score de la manière suivante : **noteEtudiant** _/ 6_ ainsi que le nombre de points obtenu sur le nombre de points total_._ Voici ce qu&#39;il faudrait faire dans les options d&#39;annotation pour la note (Figure 54).



 ![option_annotate_colors](./assets/option_annotate_colors.png)

Figure 55 Paramètre d&#39;annotation - Marquage des réponses

Finalement, vous pouvez paramétrer le type de marquage que l&#39;application va effectuer lors de l&#39;annotation de la copie. Par défaut la marque des notations est comme dans l&#39;exemple ci-dessous :

 ![pdf_annotated_results](./assets/pdf_annotated_results.png)

Figure 56 Exemple d&#39;annotation (par défaut)

Une croix rouge signifie que l&#39;étudiant a répondu faux, tandis qu&#39;un cercle vert indique qu&#39;il a répondu correctement. Un cercle rouge entoure la bonne réponse qui a été manquée. Ainsi l&#39;on peut constater par exemple à la question que l&#39;étudiant à obtenu 2 réponses justes (2x2 points) et a oublié la réponse D (-1 point) le résultat est donc celui que l&#39;on souhaitait (2x2-1=3).

AMCUI vous offre la possibilité de personnaliser ces marquages en jouant avec les paramètres et les couleurs mises à disposition par les options d&#39;annotations (Figure 55).

## Annotations des copies (générations des fichiers)

Lorsque vos paramètres sont réglés et que les associations sont faites, rendez-vous dans l&#39;onglet **grade** et cliquez sur le bouton **Annotate all**.

Un document .zip sera alors téléchargeable et contiendra les copies annotées des étudiants. Une technique est de n&#39;imprimer que la première page générée (celle qui contient la note) et de l&#39;ajouter à la map de l&#39;examen. Bien joué, vous avez corrigé les examens !

Vous pouvez maintenant vous rendre dans l&#39;onglet **option** et cliquer sur le bouton **students.csv** et **export.ods** pour télécharger le fichier CSV (étudiant et ntoes) et ODS (Synthèse des résultats) contenant la note finale et le nombre de points obtenus (préférez ouvrir ces fichiers avec Excel).

## Synthèse des résultats

AMCUI vous offre la possibilité de consulter les résultats par question. Rendez-vous dans l&#39;onglet **grade** et cliquer sur le bouton **stats** (se trouve à droite du bouton **students** ).  Un nouveau sous-onglet apparaît. Il vous permet de voir quelles réponses ont été cochées et à quel pourcentage ainsi que d&#39;autres informations comme le taux de réussite à la question.

 ![stats](./assets/stats.png)

Figure 57 Statistique de l&#39;examen



1

#
 [https://fr.wikipedia.org/wiki/Universal\_Second\_Factor](https://fr.wikipedia.org/wiki/Universal_Second_Factor)

2

#
 [https://www.yubico.com/products/yubikey-hardware/](https://www.yubico.com/products/yubikey-hardware/)

3

#
 [https://www.auto-multiple-choice.net/auto-multiple-choice.fr/interface-graphique.shtml](https://www.auto-multiple-choice.net/auto-multiple-choice.fr/interface-graphique.shtml)

4

#
 [https://www.auto-multiple-choice.net/auto-multiple-choice.fr/latex.shtml](https://www.auto-multiple-choice.net/auto-multiple-choice.fr/latex.shtml)