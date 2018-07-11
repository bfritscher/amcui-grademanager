# Options avancées

## Partager un projet

Dans l&#39;onglet **option,** le premier élément configurable est la section **Collaborators** et elle permet le partage du projet. Tout ce dont vous avez besoin est le nom d&#39;utilisateur de votre collègue.

Il pourra ainsi consulter votre examen ou copier les questions de ses projets vers le vôtre ! Demandez-lui éventuellement un Feed-back si c&#39;est la première fois que vous utilisez l&#39;application,

TODO use enter


## Paramétrage du barème pour une question

Il vous est possible de définir le nombre de points attribuable à chaque réponse (ou tout simplement laisser les options par défaut permettant d&#39;avoir 1 point par question) soit dans l&#39;élément **scoring** des QCM soit directement dans la réponse.

Pour ce faire, basez-vous sur le tableau suivant :

 ![scoring_table](./assets/scoring_table.png)
3

Figure 27 Tableau des paramètres

Il vous est possible de mettre en place ces paramètres dans les éléments **scoring** des questions à choix simple et multiple.

Par exemple pour la première question que nous avons créée dans la section 3.2.4 le paramètre par défaut est **mz=1** ce qui signifie que l&#39;élève doit faire une réponse parfaite pour obtenir le nombre de point égal à la valeur de **mz**. Si la valeur par défaut **mz** n&#39;était pas gérée par l&#39;application, vous auriez alors dû écrire vous-même le paramètre dans la section **scoring** comme présentée à la Figure 28 Paramétrage d&#39;un attribut (scoring). S&#39;il y a plusieurs attributs, séparez-les par une virgule.

 ![scoring_single](./assets/scoring_single.png)

Figure 28 Paramétrage d&#39;un attribut (scoring)

Dans le cadre de la deuxième question (choix multiple) crée dans la section 3.2.5 nous désirons affecter 2 points par réponse correcte et -1 point par mauvaise réponse. Nous voulons aussi mettre en place le fait qu&#39;une réponse correcte qui n&#39;a pas été cochée enlève 1 point.

Placer la commande **\bareme** après une réponse permet d&#39;indiquer le nombre de points que nous souhaitons lui attribuer. Lorsque vous éditez le contenu de la réponse, placer votre curseur à la fin de la réponse et cliquer sur le bouton LaTeX. Le code doit alors s&#39;afficher en rouge et ne sera bien évidemment pas visible dans la version imprimée. Juste après la commande, ouvrez des accolades et insérez vos attributs comme montrés dans la Figure 30.

 ![edit_text_menu_latex](./assets/edit_text_menu_latex.png)

Figure 29 Barre d&#39;édition de contenu (focalisé sur LaTeX)

Par exemple, une bonne réponse doit donner 2 points si elle est cochée et -1 point si elle est oubliée. Nous utilisons donc les attributs **b** et **m**. ![scoring_custom_1](./assets/scoring_custom_1.png)

Figure 30 - Code LaTeX - barème bonne réponse

En nous basant sur le tableau de la Figure 27, nous utilisons la propriété **b** qui définit le nombre de points d&#39;une bonne réponse, et **m** qui définit le nombre de points à donner pour une mauvaise réponse. Pour les mauvaises réponses, elles donnent naturellement 0 point, mais si elles sont cochées alors nous allons donner -1 point à l&#39;étudiant.

 ![scoring_custom_2](./assets/scoring_custom_2.png)

Figure 31 Code LaTeX - barème mauvaise réponse

Nous allons répliquer ces commandes sur toutes nos réponses. Grâce à cette méthode, vous avez la possibilité d&#39;accorder plus ou moins de points à une certaine réponse que vous trouvez par exemple très importante ou inversement enlever plus de points sur une réponse spécifique.

Nous allons également fixer la note plancher à 0. C&#39;est un attribut général qui s&#39;applique à la question, nous pouvons donc écrire **p=0** dans l&#39;élément **scoring**. Toute la liste des attributs et leurs explications sont disponibles à la Figure 27.

 ![scoring_multiple](./assets/scoring_multiple.png)

Figure 32 Code LaTeX - note plancher à 0

Il ne s&#39;agit que d&#39;un exemple et rien ne vous oblige à appliquer un barème de ce type-là. Il est tout à fait possible de garder le système qui par défaut offre un point par question. Vous pouvez également ne pas mettre de note plancher, à ce moment-là un étudiant peut avoir un nombre de points négatif à une question.

 ![edit_question_custom_scoring](./assets/edit_question_custom_scoring.png)

Figure 33 Application de la commande \bareme sur les réponses

Nous avons donc paramétré avec précision le nombre de points de chaque réponse pour la question 2. Pour synthétiser :

- --La commande barème permet de définir le nombre de points d&#39;une question
- --L&#39;attribut **p** (=0) signifie que nous avons fixé la note plancher à 0 (l&#39;étudiant ne pourra pas avoir de point négatif)
- --Bonne réponse (case verte à gauche de la réponse):
  - L&#39;attribut **b** (=2) signifie que si la case est cochée cela fournira 2 points à l&#39;étudiant
  - L&#39;attribut **m** (=-1) signifie que si la case a été oubliée, alors l&#39;étudiant aura un malus de 1 point
- --Mauvaise réponse (case rouge à gauche de la réponse) :
  - L&#39;attribut **b** (=0 )signifie que cette réponse ne donne pas de point si on l&#39;oublie
  - L&#39;attribut **m** (=-1) signifie que si cette réponse est cochée, alors elle fournira -1 point.
- --_Vous pouvez ignorer ce chapitre si vous souhaitez effectuer un examen simple avec 1 point par question (QCM)._

Le but de cette documentation utilisateur est de vous aider à mettre en place un projet AMCUI et non de vous offrir une liste exhaustive de toutes les possibilités offertes par le code LaTeX.

Il est tout à fait possible de créer un examen en gardant la configuration par défaut (une question = 1 point). Ce chapitre nous aura permis de voir quelques fonctionnalités supplémentaires et subtiles par rapport à l&#39;adaptation du barème en code LaTeX. Si vous avez une base en programmation, vous pouvez obtenir beaucoup plus de détail dans la documentation AMC4 dédié au code LaTeX.

## Authentification à deux facteurs

Si vous le souhaitez, il est également possible d&#39;activer une authentification à deux facteurs (Figure 7) si vous souhaitez bénéficier d&#39;un peu plus de sécurité pour accéder à vos projets. Pour l&#39;instant l&#39;authentification à deux facteurs fonctionne avec une clef U2F1 vous devez donc en posséder une pour activer l&#39;authentification à deux facteurs. Dans ce tutoriel nous utilisons une YubiKey2.

 ![2factor](./assets/2factor.png)


Branchez votre clef U2F et écrivez votre mot de passe puis cliquez sur le bouton **ADD U2F KEY**. L&#39;application va vous demander de brancher/activer votre clef U2F, appuyez sur le bouton central (le Y dans la Figure 6 si vous utilisez une YubiKey) pour activer la double authentification. Vous obtiendrez le résultat de la Figure 8.

 ![2factor_success](./assets/2factor_success.png)

Figure 8 Authentification à deux facteurs en place

Maintenant lorsque vous vous connectez à l&#39;application, vous devrez activer votre clef U2F après avoir inséré vos informations de connexion (login + mot de passe). Pour enlever la double authentification, insérez votre mot de passe et cliquez sur **REMOVE U2F KEY**.
