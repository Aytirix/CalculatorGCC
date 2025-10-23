Je veux un site qui permet de sinmuler le nombre d'xp d'un etudiant le l'ecole 42
donmc il faut :

Prerequis :
React, Framer Motion, shadcn/ui, React Router, scss

Utiliser la db local de son navigateur pour stocker les informations. tout doit etre chiffrer pour plus de securiter.
Il doit pouvoir exporter et importer ces donnees.

Je veux un theme blanc et un darkmode, donc le site doit avoir une Architecture SCSS thématique

ETAPE 1 :

L'obliger a se connecter avec son compte 42 :
https://api.intra.42.fr/apidoc/guides/getting_started

Avoir un menu deroulant en haut a droite qui permet d'aller sur une page parameteres pour exporter et importer ces donnees et un autre bouton pour se deconnecter.

ETAPE 2 :

l'api de 42 https://api.intra.42.fr/apidoc

Je veux un visualiseur qui affiche pour chaque RNCP
Le level minimum, le nombre d'event minimum, et d'expercience professionel minimum.
biensur faut regarder l'api de 42 pour recupere ces informations pour montrer a l'utilisateur si il a atteint l'objectif ou non.

et dans chaque RNCP il peut avoir plusieurs categorie donc :
le nombre de projet minimum, l'experience minimum
et afficher la liste les un en dessous des autres les projets avec l'xp qui donne
sur chaque projet, il faut le selectionner automatiquement si la personne a deja fait le projet. donc l'afficher en vert
Il peut aussi cliquer sur un projet qui n'a pas encore ete fait et sa simule les points d'xp sur son level de base.

dans le dossier public/level.json
tu as le level et l'xp requis pour etre de se level.

Voici les infos des 4 rncp :

RNCP 6 Développement web et mobile :
level requis : 17
Evenements requis : 10
Experience professionnel requis : 2

Web :
Requis 2
Experience requis : 15K XP
camagru : 4200XP
matcha : 9450 XP
hypertube : 15750XP
darkly : 6300XP
red-tetris : 15750XP
h42n42 : 9450XP
Piscine PHP Symfony 9450XP
    - Day 00
    - Day 01
    - Day 02
    - Day 03
    - Day 04
    - Day 05
    - Day 06
    - Day 07
    - Day 08
    - Day 09
    - Rush 00
    - Rush 01
    - Day 00
    - Day 01
    - Day 02
    - Day 03
    - Day 04
    - Day 05
    - Day 06
    - Day 07
    - Day 08
    - Day 09
    - Rush 00
    - Rush 01

Piscine Ruby on Rails 9450XP
    - Day 00
    - Day 01
    - Day 02
    - Day 03
    - Day 04
    - Day 05
    - Day 06
    - Day 07
    - Day 08
    - Day 09
    - Rush 00
    - Rush 01

Pisicne Django
    - Django - 0 - Initiation
    - Django - 0 - Starting
    - Django - 0 - Oob : 1500XP
    - Django - 1 - Lib
    - Django - 1 - Base Django : 3475XP
    - Django - 2 - SQL : 1000XP
    - Django - 3 : Sessions
    - Django - 3 : Advanced
    - Django - 3 - Final : 3475XP
Tokenizer : 9450XP

Mobile :
ft_hangouts : 4200XP
switfy-companion : 4200XP
switfy-proteins : 15750XP
Mobile
    - Mobile - 0 - Basic of the mobile app : 500xp
    - Mobile - 1 - Structure and logic : 950XP
    - Mobile - 2 - API and data : 1000XP
    - Mobile - 3 - Design : 2000XP
    - Mobile - 4 - Auth and dataBase : 2000XP
    - Mobile - 5 - Manage data and display : 3000XP

Suite :
humangl : 4200XP
kfs-2 : 15750XP
pestillence : 15750XP
override : 35750XP
doom-nukem : 15750XP
42sh : 15750XP
rt : 20750XP
Inception-of-Things : 25450XP

RNCP 6 Développement applicatif :
level requis : 17
Evenements requis : 10
Experience professionnel requis : 2

Functional programming :
ft_turing 9450XP
ft_ality 4200XP
h42n42n 9450XP

Imperative programming :
libasm966 XP
taskmaster 9450XP
strace 9450XP
snow-crash 9450XP
darkly 6300XP
gbmu3 1500XP
ft_linux 4200XP
little-penguin-1 9450XP
rainfall2 5200XP
woody-woodpacker 9450XP
matt-daemon 9450XP
kfs-21 5750XP
kfs-11 5750XP
famine 9450XP
pestilence1 5750XP
boot2root1 1500XP
ft_shield1 5750XP
override3 5700XP
ft_ssl_md5 9450XP
zappy2 5200XP
lem-ipc 9450XP
nm 9450XP
malloc 9450XP
ft_malcolm 6000XP

Suite :
humangl 4200XP
kfs-21 5750XP
pestilence1 5750XP
override3 5700XP
doom-nukem1 5750XP
total-perspective-vortex 9450XP
42sh1 5750XP
rt2 0750XP
Inception-of-Things2 5450XP
Bgp At Doors of Autonomous Systems is Simple2 2450XP

RNCP 7 Système d'information et réseaux :
level requis : 21
Evenements requis : 15
Experience professionnel requis : 2

System Administration :
taskmaster 9450XP
ft_ping 4200XP
ft_traceroute 4200XP
ft_nmap1 5750XP
cloud-1 9450XP
Inception-of-Things2 5450XP
Bgp At Doors of Autonomous Systems is Simple2 2450XP
ActiveDiscovery1 5750XP
AutomaticDirectory 9450XP
AdministrativeDirectory 9450XP
AccessibleDirectory 9450XP

Security :
snow-crash 9450XP
darkly 6300XP
rainfall2 5200XP
woody-woodpacker 9450XP
famine 9450XP
pestilence1 5750XP
boot2root1 1500XP
ft_shield1 5750XP
override3 5700XP
ft_ssl_md5 9450XP
ft_malcolm 6000XP
Cybersecurity
UnleashTheBox1 5750XP
ActiveConnect1 5750XP
MicroForensX 9450XP
ActiveTechTales1 5750XP

Suite :
humangl 4200XP
kfs-21 5750XP
pestilence1 5750XP
override3 5700XP
doom-nukem1 5750XP
total-perspective-vortex 9450XP
42sh1 5750XP
rt2 0750XP
Inception-of-Things2 5450XP
Bgp At Doors of Autonomous Systems is Simple2 2450XP

RNCP 7 Architecture des bases de donnees et data :
level requis : 21
Evenements requis : 15
Experience professionnel requis : 2

Web - Database :
camagru 4200XP
matcha 9450XP
hypertube1 5750XP
darkly 6300XP
red-tetris1 5750XP
h42n42 9450XP
Piscine PHP Symfony 9450XP
    - Day 00
    - Day 01
    - Day 02
    - Day 03
    - Day 04
    - Day 05
    - Day 06
    - Day 07
    - Day 08
    - Day 09
    - Rush 00
    - Rush 01
Piscine Ruby on Rails 9450XP
    - Day 00
    - Day 01
    - Day 02
    - Day 03
    - Day 04
    - Day 05
    - Day 06
    - Day 07
    - Day 08
    - Day 09
    - Rush 00
    - Rush 01
Piscine Django
    - Django - 0 - Initiation
    - Django - 0 - Starting
    - Django - 0 - Oob : 1500XP
    - Django - 1 - Lib
    - Django - 1 - Base Django : 3475XP
    - Django - 2 - SQL : 1000XP
    - Django - 3 : Sessions
    - Django - 3 : Advanced
    - Django - 3 - Final : 3475XP
Tokenizer 9450XP

Artificial Intelligence :
gomoku25 200 XP
expert-system9 450 XP
ft_linear_regression4 200 XP125
krpsim9 450 XP
dslr6 000 XP
multilayer-perceptron9 450 XP
total-perspective-vortex9 450 XP
ready set boole7 000 XP
matrix7 000 XP
Python for Data Science
    - Python - 0 - Starting 545Xp
    - Python - 1 - Array 545Xp
    - Python - 2 - Data Table 545Xp
    - Python - 3 - OOP 545Xp
    - Python - 4 - Dod 2545Xp
Piscine Data Science
    - Data Science - 0 545Xp
    - Data Science - 1 545Xp
    - Data Science - 2 545Xp
    - Data Science - 3 545Xp
    - Data Science - 4 2545Xp
Leaffliction15 750 XP

Suite :
humangl 4200XP
kfs-21 5750XP
pestilence1 5750XP
override3 5700XP
doom-nukem1 5750XP
total-perspective-vortex 9450XP
42sh1 5750XP
rt2 0750XP
Inception-of-Things2 5450XP
 Bgp At Doors of Autonomous Systems is Simple2 2450XP