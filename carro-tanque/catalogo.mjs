// Catálogo de piezas: nombre en español, término de taller en inglés, función y material.
// Cada pieza dibujada apunta a un tipo de este catálogo.

export const ENSAMBLES = {
  tanque: { n: 1, es: "Tanque", en: "tank", say: "tanque · virola, cabezales, aislamiento y chaqueta" },
  accesorios: { n: 2, es: "Accesorios superiores", en: "top fittings", say: "accesorios superiores · carga, alivio y entrada de hombre" },
  descarga: { n: 3, es: "Descarga inferior", en: "bottom outlet", say: "descarga inferior · válvula, manija y protección" },
  estructura: { n: 4, es: "Estructura", en: "underframe", say: "estructura · vigas de tiro, travesaños y placas" },
  bogies: { n: 5, es: "Bogíes", en: "trucks", say: "bogíes · dos de tres piezas, 4 ejes" },
  enganches: { n: 6, es: "Enganches", en: "coupling & draft system", say: "enganches · acoplador tipo E con doble repisa" },
  frenos: { n: 7, es: "Frenos", en: "air & hand brake", say: "frenos · aire y freno de mano" },
  seguridad: { n: 8, es: "Seguridad", en: "safety appliances", say: "seguridad · escaleras, estribos y barandales" },
  via: { n: 0, es: "Vía", en: "track", say: "vía · trocha 1435 mm" },
};

export const TIPOS = {
  // Vía (contexto, no es parte del carro)
  riel: { es: "Riel", en: "rail", fn: "Guía y soporta las ruedas; la trocha (1435 mm) se mide entre las caras internas de los hongos.", mat: "Acero de riel perlítico" },

  // Bogíe
  bastidor: { es: "Bastidor lateral", en: "side frame", fn: "Transmite la carga del travesaño a los ejes a través de los adaptadores; aloja el grupo de resortes en su ventana.", mat: "Acero fundido grado B+" },
  travesano: { es: "Travesaño del bogíe", en: "truck bolster", fn: "Viga transversal que recibe la placa central del carro y descansa sobre los resortes; el carro gira sobre ella en las curvas.", mat: "Acero fundido grado B+" },
  tazon: { es: "Tazón de placa central", en: "center plate bowl", fn: "Cavidad del travesaño donde asienta y pivota la placa central del carro.", mat: "Acero fundido con forro de desgaste" },
  resortes: { es: "Grupo de resortes", en: "spring nest / spring group", fn: "Resortes helicoidales de suspensión entre el asiento del bastidor y el travesaño.", mat: "Acero al silicio-manganeso templado" },
  cuna: { es: "Cuña de fricción", en: "friction wedge", fn: "Amortigua las oscilaciones verticales rozando contra la placa de desgaste de la columna del bastidor.", mat: "Fundición dúctil / acero templado" },
  ejeMontado: { es: "Eje montado (eje con ruedas)", en: "wheelset", fn: "Dos ruedas de 36 in (914 mm) prensadas sobre el eje; ruedan sobre los rieles.", mat: "Acero forjado AAR clase C" },
  rueda: { es: "Rueda de 36 in", en: "36-in wheel", fn: "Rueda de banda cónica con pestaña interior que guía al eje en la vía.", mat: "Acero forjado AAR clase C" },
  eje: { es: "Eje", en: "axle", fn: "Une las dos ruedas y lleva los rodamientos en sus muñones.", mat: "Acero forjado AAR grado F" },
  rodamiento: { es: "Rodamiento", en: "roller bearing", fn: "Rodamiento cónico sellado en el muñón del eje; permite que el eje gire bajo carga.", mat: "Acero de rodamiento AISI 52100" },
  tapaRodamiento: { es: "Tapa del rodamiento", en: "end cap", fn: "Tapa atornillada al extremo del eje que retiene el rodamiento.", mat: "Acero" },
  adaptador: { es: "Adaptador", en: "bearing adapter", fn: "Pieza entre el rodamiento y la mordaza del bastidor; reparte la carga sobre la copa del rodamiento.", mat: "Acero fundido / hierro dúctil" },
  apoyoBogie: { es: "Apoyo lateral del bogíe", en: "truck side bearing", fn: "Soporte de contacto constante que limita el balanceo del carro sobre el bogíe.", mat: "Acero con elastómero" },

  // Frenos del bogíe
  vigaFreno: { es: "Viga de freno", en: "brake beam", fn: "Viga transversal que lleva las cabezas y zapatas y las aprieta contra la banda de las ruedas.", mat: "Acero estructural" },
  cabezaFreno: { es: "Cabeza de freno", en: "brake head", fn: "Soporte en el extremo de la viga donde se engancha la zapata.", mat: "Acero fundido" },
  zapata: { es: "Zapata de freno", en: "brake shoe", fn: "Bloque de fricción que roza la banda de rodadura y frena la rueda.", mat: "Material compuesto sobre placa de acero" },
  palanca: { es: "Palanca de freno", en: "brake lever", fn: "Multiplica la fuerza del cilindro y la reparte entre las dos vigas.", mat: "Acero forjado" },
  timoneria: { es: "Timonería (varilla de empuje)", en: "push rod / brake rigging", fn: "Varillas que unen las palancas de las dos vigas y transmiten el esfuerzo de frenado.", mat: "Acero" },
  ajustador: { es: "Ajustador de varillaje", en: "slack adjuster", fn: "Compensa automáticamente el desgaste de las zapatas manteniendo constante la carrera del cilindro.", mat: "Acero con mecanismo interno" },
  cilindro: { es: "Cilindro de freno", en: "brake cylinder", fn: "Convierte la presión de aire en fuerza de empuje sobre la timonería (montado en la viga, sistema TMX).", mat: "Hierro fundido / acero" },
};

Object.assign(TIPOS, {
  // Estructura
  vigaTiro: { es: "Viga de tiro (con cara de choque)", en: "stub sill & striker", fn: "Viga corta en cada extremo que aloja el aparato de choque y tracción y transmite los esfuerzos del tren al tanque; en la punta lleva la cara de choque (striker).", mat: "Acero estructural ASTM A572 / fundición" },
  travesanoPivote: { es: "Travesaño pivote del carro", en: "body bolster", fn: "Viga transversal sobre el bogíe que lleva la placa central y los apoyos laterales del carro.", mat: "Acero estructural soldado" },
  placaCentral: { es: "Placa central", en: "body center plate", fn: "Disco que asienta en el tazón del bogíe; es el pivote sobre el que gira el bogíe y por donde baja el peso del carro.", mat: "Acero forjado / fundido" },
  apoyoCarro: { es: "Apoyo lateral del carro", en: "body side bearing", fn: "Placa de desgaste bajo el travesaño pivote que asienta sobre el apoyo lateral del bogíe.", mat: "Acero templado" },
  rellenoCentral: { es: "Relleno central de la viga", en: "center filler", fn: "Bloque entre las almas de la viga de tiro que transmite la carga a la placa central.", mat: "Acero fundido" },
  // Tanque
  chaqueta: { es: "Chaqueta exterior", en: "jacket", fn: "Forro de lámina de acero calibre 11 que cubre y protege el aislamiento térmico; se pinta de negro.", mat: "Acero A1011, 3 mm (calibre 11)" },
  aislamiento: { es: "Aislamiento térmico", en: "thermal protection", fn: "Manta cerámica de 1/2 in entre virola y chaqueta; protege el tanque en caso de fuego envolvente (100 min).", mat: "Fibra cerámica 13 mm" },
  virola: { es: "Virola (cuerpo cilíndrico)", en: "tank shell", fn: "Cilindro que contiene el producto, formado por anillos soldados.", mat: "Acero TC-128B normalizado, 9/16 in (14.3 mm)" },
  cabezal: { es: "Cabezal", en: "tank head", fn: "Tapa semielíptica 2:1 soldada a cada extremo de la virola.", mat: "Acero TC-128B, 9/16 in (14.3 mm)" },
  escudo: { es: "Escudo de cabezal (altura completa)", en: "full-height head shield", fn: "Placa que cubre todo el cabezal y lo protege de perforaciones por acopladores en un choque.", mat: "Acero 1/2 in (12.7 mm)" },
  sumidero: { es: "Sumidero", en: "sump", fn: "Cavidad en el fondo de la virola donde se junta el líquido para vaciar el tanque por completo; allí llega el tubo buzo y se monta la válvula inferior.", mat: "Acero fundido / forjado" },
  placaRefuerzo: { es: "Placa de refuerzo (asiento de la viga)", en: "sill pad / head brace", fn: "Placa soldada al tanque que reparte la carga entre la viga de tiro y el cabezal.", mat: "Acero estructural" },
});

Object.assign(TIPOS, {
  // Accesorios superiores
  boquilla: { es: "Boquilla de la entrada de hombre", en: "manway nozzle & mounting pad", fn: "Cuello soldado al tanque que atraviesa chaqueta y aislamiento; sobre su brida se atornillan la tapa y la caja protectora.", mat: "Acero forjado / TC-128B" },
  caja: { es: "Caja protectora de accesorios", en: "top fittings protective housing", fn: "Anillo de acero que rodea las válvulas superiores y las protege en un vuelco (requisito DOT-117).", mat: "Acero estructural 1/2 in" },
  tapaCaja: { es: "Tapa abatible de la caja", en: "housing cover", fn: "Cubierta con bisagra que cierra la caja protectora; se abre para cargar.", mat: "Acero" },
  tapaManway: { es: "Tapa de la entrada de hombre", en: "manway cover", fn: "Placa que cierra la boca de inspección de 20 in y sirve de base para todas las válvulas superiores.", mat: "Acero forjado" },
  tornillos: { es: "Tornillos abatibles de la tapa", en: "manway swing bolts", fn: "Pernos con tuerca que aprietan la tapa contra su empaque; se abaten para abrirla.", mat: "Acero aleado ASTM A193 B7" },
  prd: { es: "Válvula de alivio de presión", en: "pressure relief device (PRD)", fn: "Se abre si la presión interna supera el ajuste (75 psi típico) y se cierra al bajar.", mat: "Acero inoxidable / bronce" },
  vacio: { es: "Válvula de vacío", en: "vacuum relief valve", fn: "Deja entrar aire si el tanque queda en vacío al descargar o enfriarse, evitando que colapse.", mat: "Acero inoxidable" },
  valvulaLiquido: { es: "Válvula de carga/descarga superior (línea de líquido)", en: "liquid eduction valve", fn: "Válvula de bola de 3 in por la que se carga o se descarga el producto a través del tubo buzo.", mat: "Bronce / acero inoxidable" },
  valvulaVapor: { es: "Válvula de vapor", en: "vapor valve", fn: "Válvula de bola de 2 in que conecta el espacio de vapor para igualar presión al cargar.", mat: "Bronce / acero inoxidable" },
  tuboBuzo: { es: "Tubo buzo", en: "eduction pipe", fn: "Tubo que baja desde la válvula de líquido hasta el sumidero para sacar el producto por arriba.", mat: "Acero al carbono / inoxidable" },
  // Descarga inferior
  bov: { es: "Válvula de salida inferior", en: "bottom outlet valve (BOV)", fn: "Válvula atornillada a la brida del sumidero por donde se descarga por gravedad.", mat: "Acero fundido con asiento de PTFE" },
  manijaBov: { es: "Manija de operación de la válvula inferior", en: "BOV operating handle", fn: "Eje y manija para abrir la válvula desde el costado; en DOT-117 debe soltarse o resistir un impacto sin abrir.", mat: "Acero" },
  skid: { es: "Protección de la válvula inferior", en: "bottom outlet skid", fn: "Estructura que rodea la válvula para que no se arranque si el carro se arrastra o descarrila.", mat: "Acero estructural" },
  // Frenos de cuerpo
  tuberiaFreno: { es: "Tubería de freno (tubo general)", en: "brake pipe / train line", fn: "Lleva el aire del tren de punta a punta; una baja de presión ordena frenar.", mat: "Tubo de acero cédula 80, 1-1/4 in" },
  soporteTubo: { es: "Soporte de tubería", en: "pipe bracket / clamp", fn: "Abrazadera que sujeta la tubería de freno al fondo del tanque.", mat: "Acero" },
  llaveAngular: { es: "Llave angular", en: "angle cock", fn: "Llave al final de la tubería que se abre al acoplar y se cierra en el último carro.", mat: "Bronce / hierro maleable" },
  manguera: { es: "Manguera de aire con cabeza de acoplamiento", en: "air hose & glad hand", fn: "Une la tubería de freno con la del carro vecino; la cabeza (glad hand) se acopla a mano.", mat: "Caucho reforzado / hierro maleable" },
  valvulaControl: { es: "Válvula de control", en: "control valve (ABDX)", fn: "Compara la presión de la tubería con la del depósito y manda aire al cilindro para frenar o lo libera para soltar.", mat: "Aluminio / hierro fundido" },
  deposito: { es: "Depósito de aire de dos compartimentos", en: "combined reservoir (auxiliary + emergency)", fn: "Guarda el aire de servicio y el de emergencia en dos cámaras separadas.", mat: "Acero soldado" },
  ramal: { es: "Ramal a la válvula de control", en: "branch pipe & tee", fn: "Conecta la tubería de freno con la válvula de control.", mat: "Tubo de acero" },
  tuboDeposito: { es: "Tubos del depósito", en: "reservoir pipes", fn: "Unen las dos cámaras del depósito con la válvula de control.", mat: "Tubo de acero" },
  frenoMano: { es: "Freno de mano (caja de engranes)", en: "hand brake", fn: "Mecanismo de engranes que, al girar el volante, tensa la cadena y aplica los frenos sin aire.", mat: "Hierro fundido / acero" },
  volante: { es: "Volante del freno de mano", en: "hand brake wheel", fn: "Rueda que gira el operador para apretar el freno de mano.", mat: "Acero" },
  cadena: { es: "Cadena del freno de mano", en: "hand brake chain", fn: "Transmite la tensión del freno de mano a la palanca acodada y de ahí a la timonería.", mat: "Acero de alta resistencia" },
  palancaAcodada: { es: "Palanca acodada", en: "bell crank", fn: "Cambia la dirección del tiro de la cadena hacia la timonería del bogíe.", mat: "Acero" },
  soporteFreno: { es: "Soporte del freno de mano", en: "hand brake bracket", fn: "Poste atornillado a la viga de tiro que sostiene la caja de engranes.", mat: "Acero" },
  // Enganches
  acoplador: { es: "Acoplador tipo E de doble repisa", en: "E-type double-shelf coupler", fn: "Cabeza con nudillo que se engancha al carro vecino; las repisas superior e inferior impiden que se desenganche en un choque o descarrilamiento.", mat: "Acero fundido grado E" },
  yugo: { es: "Yugo", en: "yoke", fn: "Marco que abraza al aparato de choque y lo une al vástago del acoplador mediante la llave.", mat: "Acero fundido grado E" },
  aparato: { es: "Aparato de choque y tracción", en: "draft gear", fn: "Amortiguador de fricción o elastómero que absorbe los golpes de compresión y tracción del tren.", mat: "Acero con resortes/elastómero" },
  llave: { es: "Llave de enganche (chaveta)", en: "coupler / draft key", fn: "Chaveta transversal que atraviesa las almas de la viga, el yugo y el vástago y los mantiene unidos.", mat: "Acero forjado" },
  soporteAcoplador: { es: "Soporte del acoplador", en: "coupler carrier", fn: "Placa bajo el vástago que sostiene al acoplador a la altura correcta.", mat: "Acero con placa de desgaste" },
  // Seguridad
  plataforma: { es: "Plataforma superior", en: "top platform / walkway", fn: "Piso de rejilla antideslizante para trabajar junto a la caja de accesorios.", mat: "Rejilla de acero galvanizado" },
  barandal: { es: "Barandal", en: "handrail", fn: "Baranda alrededor de la plataforma para evitar caídas.", mat: "Tubo de acero pintado amarillo" },
  escalera: { es: "Escalera lateral", en: "side ladder", fn: "Acceso del suelo a la plataforma superior.", mat: "Acero pintado amarillo de seguridad" },
  agarradera: { es: "Agarradera", en: "grab iron / handhold", fn: "Asidero para subir y bajar con tres puntos de apoyo.", mat: "Barra de acero 5/8 in" },
  estribo: { es: "Estribo", en: "sill step", fn: "Peldaño bajo el costado para subir al carro desde el suelo.", mat: "Acero pintado amarillo" },
  placa: { es: "Placa con número ONU", en: "UN placard holder", fn: "Rombo de clase 3 (líquido inflamable) con el número ONU del producto; aquí 1993, genérico de combustible (1202 diésel, 1203 gasolina).", mat: "Acero / aluminio con lámina reflectiva" },
});
