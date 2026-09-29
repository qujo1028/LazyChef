// Keyword rules that guess a grocery section from a name. Used by guessCategory() for names the
// library doesn't know, and by scripts/build-ingredient-library.mjs for Spoonacular rows the curated
// lists don't place. Pure, erasable TypeScript (Node runs it with type stripping at build time).
//
// Rules see the name's words folded and singular ("Frozen Dumplings" → "frozen dumpling"), with
// diet/label modifiers removed ("sugar free jam" → "jam"). Each rule is a list of alternatives that
// must match whole words. Order of checks (see categoryByRules):
//   1. household words no food uses ("dish soap"), then storage words ("frozen …", "canned …",
//      "… in syrup");
//   2. the rules that match at the END of the name, in rule order (English puts the thing itself
//      last: "peanut butter cookie" is a cookie); "X with Y" / "X in Y" tries X first;
//   3. household words that only mean a household thing at the end ("kitchen sponge", but
//      "sponge cake" was caught by step 2);
//   4. the rules that match anywhere, in rule order.
import type { Category } from "../types"

/**
 * Household things that aren't food, named by words no food uses. Checked first, anywhere in the
 * name ("lysol spray", "freezer bags"); they file under "other".
 */
const NON_FOOD =
  "soap|detergent|shampoo|conditioner|toothpaste|toothbrush|deodorant|lotion|sunscreen|diaper|kleenex|" +
  "paper towel|toilet paper|toilet tissue|facial tissue|napkin|aluminum foil|aluminium foil|tin foil|" +
  "plastic wrap|cling wrap|cling film|saran wrap|wax paper|parchment paper|freezer paper|trash bag|garbage bag|" +
  "bin bag|ziploc|ziplock|zip top bag|zipper bag|sandwich bag|freezer bag|storage bag|storage container|bleach|" +
  "disinfectant|scrubber|battery|light bulb|lightbulb|mouthwash|dental floss|kitty litter|cat litter|dog food|" +
  "cat food|pet food|dog treat|cat treat|dryer sheet|fabric softener|laundry|dishwasher|paper plate|paper cup|" +
  "paper bowl|plastic cup|plastic fork|plastic spoon|plastic knife|plastic cutlery|ibuprofen|acetaminophen|" +
  "tylenol|advil|band aid|cotton ball|cotton swab|q tip|hand sanitizer|sanitizer|air freshener|shaving cream|" +
  "shaving gel|razor blade|tampon|sanitary pad|toothpick|cupcake liner|muffin liner|baking cup|coffee filter|" +
  "rubber glove|trash can|lysol|windex|clorox|swiffer|dish rack|water filter|drinking straw|gift card|" +
  "shea butter|body wash|body butter|lip balm"

/**
 * Words that mean a household thing when they END the name ("kitchen sponge", "gummy vitamins"),
 * but can be part of a food's name elsewhere ("sponge cake", "vitamin water", "chocolate shavings").
 * Checked after the food rules that match at the end.
 */
const NON_FOOD_END =
  "wipe|tissue|foil|parchment|cleaner|cleaning|sponge|litter|candle|lighter|utensil|charcoal|vitamin|" +
  "multivitamin|supplement|medicine|bandage|razor|skewer|floss|filter|mop|broom|garbage|glove|towel|bag|straw"

/** Label words that don't change the aisle ("reduced fat", "gluten free", …). Removed before the rules run. */
const MODIFIERS = new RegExp(
  "\\b(?:sugar free|gluten free|fat free|dairy free|lactose free|grain free|nut free|reduced fat|low fat|" +
    "nonfat|non fat|lowfat|low sodium|reduced sodium|less sodium|lower sodium|no salt added|salt free|low carb|" +
    "keto|lite|light|diet|zero sugar|no sugar added|reduced sugar|unsalted|salted|unsweetened|sweetened|" +
    "plain|part skim|low moisture|skim|all natural|natural|homemade|store bought|premium|vegan|allergy friendly|" +
    "kosher)\\b",
  "g",
)

/**
 * [category, alternatives]. Earlier rules win within a pass. Alternatives are regex source over
 * singular words; "(?: \\w+)*" lets a phrase swallow words up to the end ("freeze dried …").
 */
const RULES: readonly (readonly [Category, string])[] = [
  // ── Phrases that would otherwise be caught by a later, more generic word ─────────────────────
  ["bakery", "sponge cake|sponge finger|cannoli shell|cannoli"],
  ["snacks", "cotton candy|candy floss|ice cream cone|waffle cone|sugar cone|freeze dried(?: \\w+)*|fruit leather|fruit snack|conversation heart|candy heart|pretzel nugget|pretzel bite|pretzel crisp|chocolate covered(?: \\w+)+|yogurt covered(?: \\w+)+"],
  ["beverages", "vitamin water|vitaminwater|coconut water|tomato juice|vegetable juice|v8|coffee bean|espresso bean|whole bean coffee|hot chocolate|hot cocoa|drinking chocolate|cocoa mix|chocolate milk mix|chocolate milk powder|creme de \\w+|irish cream|cream liqueur|chocolate liqueur"],
  ["baking", "candied (?:orange|lemon|lime|citrus|citron|grapefruit|ginger|cherry|fruit|peel|pineapple|angelica)(?: \\w+)*|crystallized ginger|glace (?:cherry|fruit)"],
  ["produce", "fresh (?:thyme|rosemary|oregano|sage|tarragon|marjoram|savory|bay|bay leaf|lavender|coriander|cayenne|turmeric|herb|mint|dill|chive)(?: \\w+)*|butter lettuce(?: \\w+)*|butterhead lettuce(?: \\w+)*|coconut meat|young coconut|fresh coconut"],
  ["seafood", "fresh (?:tuna|sardine|anchovy|mackerel|herring)|skate wing|(?:shrimp|scallop|salmon|fish|seafood|tuna) (?:skewer|kabob|kebab)|(?:salmon|tuna|fish|shrimp|crab|seafood) (?:burger|patty|sausage)|crab cake|fish cake|sea cucumber|bombay duck|orange roughy"],
  ["spices", "(?:ancho|guajillo|pasilla|mulato|cascabel|arbol|de arbol|morita)(?: chile| chili| chilli| pepper)*"],
  ["condiments", "ice cream topping|sundae topping|fudge topping|hot fudge|fudge sauce|shell topping|magic shell"],
  ["produce", "lemon juice|lime juice|meyer lemon juice|yuzu juice|lemon zest|lime zest|orange zest|lemon peel|lime peel|orange peel|grapefruit zest"],
  ["canned", "clam juice|pickle juice|pickle brine|olive brine|tamarind juice"],
  ["frozen", "juice concentrate|lemonade concentrate|limeade concentrate|orange juice concentrate|frozen concentrate"],
  ["dairy", "coconut milk beverage|coconut milk drink|almond milk|oat milk|soy milk|soymilk|cashew milk|rice milk|hemp milk|pea milk|macadamia milk|flax milk|hazelnut milk|lactose free milk|nondairy milk|non dairy milk|plant milk|dairy free milk|chocolate milk|strawberry milk|milk substitute"],
  ["grains", "cream of wheat|cream of rice"],
  ["canned", "coconut milk|coconut cream|cream of coconut|creamed coconut|condensed (?:\\w+ )*soup|cream of \\w+(?: \\w+)* soup|cream of \\w+"],
  ["baking", "sweetened condensed milk|condensed milk|evaporated milk|evaporated skim milk|powdered milk|milk powder|dry milk|dried milk|buttermilk powder|malted milk powder|malt powder|cream of tartar"],
  ["condiments", "peanut butter|almond butter|cashew butter|nut butter|seed butter|sunflower butter|sunbutter|cookie butter|apple butter|pumpkin butter|soy butter|coconut butter|coconut manna|pecan butter|pistachio butter|hazelnut spread|chocolate spread|chocolate hazelnut spread|nutella|biscoff|fruit spread|lemon curd|lime curd|fruit curd|dulce de leche|cajeta"],
  ["snacks", "peanut butter cup|peanut butter cracker|peanut butter cookie|butter cookie|butter cracker|butter pecan|butterscotch candy"],
  ["baking", "peanut butter chip|butterscotch chip|butterscotch morsel|chocolate chip|chocolate chunk|chocolate morsel|chocolate curl|chocolate shaving|chocolate flake|chocolate sprinkle|baking chocolate|baking chip|candy melt|melting wafer|white chocolate chip|carob chip|toffee bit|caramel bit|cookie crumb|wafer crumb|graham cracker crumb|cracker crumb|cake crumb|cookie dough mix"],
  ["baking", "baking powder|baking soda|bicarbonate of soda|bicarb|corn starch|cornstarch|potato starch|tapioca starch|arrowroot|food colou?r(?:ing)?|gel colou?r|cake mix|brownie mix|cookie mix|muffin mix|cupcake mix|bread mix|cornbread mix|corn muffin mix|biscuit mix|baking mix|bisquick|carbquick|pancake mix|waffle mix|pudding mix|pie filling|pie crust mix|frosting|icing|fondant|sprinkle|nonpareil|jimmy|sanding sugar|pearl sugar|pie crust|graham cracker crust|crumb crust|tart shell|tartlet shell|dessert shell|pastry shell"],
  ["bakery", "bread dough|pizza dough|pizza crust|crescent roll|crescent dough|cookie dough|biscuit dough|breadstick dough|dough sheet|pasta dough"],
  ["frozen", "puff pastry|filo|phyllo|shortcrust pastry|pastry dough|pastry sheet|empanada dough|empanada disc|pie shell"],
  ["baking", "bread crumb|breadcrumb|crumb|panko|stuffing mix|crouton"],
  ["other", "wonton wrapper|egg roll wrapper|spring roll wrapper|dumpling wrapper|gyoza wrapper|rice paper|corn husk|banana leaf|nori|kombu|wakame|dulse|kelp|sea vegetable|seaweed|agar|bonito flake|katsuobushi|natto|konjac|tofu(?: \\w+)*|bean curd(?: \\w+)*|tempeh(?: \\w+)*|seitan(?: \\w+)*|textured vegetable protein|tvp|quorn(?: \\w+)*|beyond (?:meat|burger|beef|sausage)|impossible (?:burger|meat|beef|sausage)|plant based(?: \\w+)+|meatless(?: \\w+)*|veggie (?:dog|sausage|bacon|deli slice|slice)|vegetarian (?:dog|sausage|bacon|deli slice|slice)|protein powder|whey protein|collagen|baby food|baby formula|infant formula|cedar plank|edible gold|edible flower|gold leaf|liquid smoke"],
  ["dairy", "creamer|half and half|heavy cream|whipping cream|light cream|double cream|single cream|sour cream|whipped cream|clotted cream|creme fraiche|crema|cream cheese|cottage cheese|string cheese|cheese curd|cheese stick"],
  ["frozen", "frozen|ice cream|gelato|sorbet|sherbet|popsicle|ice pop|freezer pop|frozen yogurt|froyo|whipped topping|cool whip|tater tot|french fry|steak fry|curly fry|waffle fry|crinkle fry|potato fry|sweet potato fry|hash brown|fish stick|fish finger|chicken nugget|nugget|pizza roll|pizza bite|bagel bite|egg roll|potsticker|pot sticker|gyoza|pierogi|pierogy|tv dinner|frozen meal|pot pie|hot pocket|corn dog|taquito|toaster waffle|eggo|ice|ice cube|onion ring|mozzarella stick|jalapeno popper|texas toast|garlic bread|garlic toast|veggie burger|mochi"],

  // ── Broths, soups, sauces and other prepared things named after what's in them ──────────────
  ["spices", "bouillon(?: \\w+)*|stock cube|stock powder|broth powder|chicken base|beef base|vegetable base|soup base|better than bouillon|dashi powder|hondashi|consomme powder"],
  ["canned", "broth|stock|bone broth|consomme|soup|chowder|bisque|gumbo|chili|chili with bean|chili without bean|stew|gravy|au jus|demi glace"],
  ["grains", "ramen|instant noodle|cup noodle|noodle cup|mac and cheese|macaroni and cheese|hamburger helper|rice a roni|rice pilaf|spanish rice|yellow rice|rice mix|risotto mix|couscous mix|instant potato|potato flake|mashed potato mix|stuffing"],
  ["canned", "tomato sauce|tomato paste|tomato puree|tomato concentrate|passata|crushed tomato|diced tomato|stewed tomato|whole tomato|peeled tomato|fire roasted tomato|san marzano|rotel|tomato in juice|pasta sauce|marinara|spaghetti sauce|pizza sauce|alfredo sauce|vodka sauce|arrabbiata|bolognese|enchilada sauce|mole sauce|sloppy joe sauce|manwich|cranberry sauce|applesauce|apple sauce|fruit cocktail|pie filling can"],
  ["condiments", "fish sauce|oyster sauce|soy sauce|hot sauce|chili sauce|chile sauce|sweet chili sauce|chili garlic sauce|sriracha|tabasco|worcestershire|teriyaki|hoisin|barbecue sauce|bbq sauce|steak sauce|buffalo sauce|wing sauce|tartar sauce|cocktail sauce|pesto|salsa|picante|taco sauce|hot pepper sauce|pepper sauce|mint sauce|mint jelly|horseradish sauce|horseradish|wasabi|ketchup|catsup|mustard|mayonnaise|mayo|aioli|miracle whip|salad cream|remoulade|dressing|vinaigrette|marinade|glaze|chutney|relish|jam|jelly|preserve|marmalade|conserve|honey|syrup|molasses|treacle|agave|maple|ghee|oil|vinegar|cooking spray|oil spray|spray|tahini|miso|gochujang|doenjang|doubanjiang|sambal|harissa|chili crisp|chili paste|chile paste|curry paste|chipotle paste|garlic paste|ginger paste|ginger garlic paste|anchovy paste|tamarind paste|shrimp paste|belacan|red bean paste|bean paste|ponzu|mirin|cooking wine|rice wine|shaoxing|cooking sherry|amino|tamari|shoyu|kecap manis|browning sauce|kitchen bouquet|tapenade|bruschetta|chimichurri|sauce"],

  // ── Seafood before meat (tuna steak, salmon burger, fish sausage …) ──────────────────────────
  ["canned", "canned (?:\\w+ )*(?:tuna|salmon|sardine|anchovy|crab|clam|mackerel|herring|oyster|chicken)|tuna in(?: \\w+)+|tuna packed in(?: \\w+)+|(?:oil|water) packed tuna|albacore|light tuna|chunk light|sardine|anchovy|kipper|spam|vienna sausage|potted meat|deviled ham|corned beef hash|anchovy in(?: \\w+)+"],
  ["seafood", "fresh tuna|tuna steak|tuna fillet|ahi|yellowfin|bluefin|fresh sardine|fresh anchovy|fish|salmon|cod|tilapia|halibut|haddock|pollock|catfish|trout|bass|seabass|snapper|grouper|mahi|mahi mahi|swordfish|sole|flounder|plaice|branzino|mackerel|herring|sea bream|bream|monkfish|perch|walleye|pike|carp|arctic char|char|barramundi|whitefish|whiting|hake|rockfish|orange roughy|turbot|skate|skate wing|eel|unagi|shrimp|prawn|crab|crabmeat|lobster|langoustine|langostino|crawfish|crayfish|scallop|clam|mussel|oyster|squid|calamari|octopus|cuttlefish|caviar|roe|ikura|tobiko|uni|sea urchin|surimi|imitation crab|imitation lobster|lox|gravlax|seafood|cockle|conch|abalone|escargot|snail|sea cucumber|bottarga|bluefish|pompano|tilefish|sablefish|black cod|yellowtail|hamachi|pangasius|swai|basa|smelt|shad|whitebait|pomfret|redfish|red mullet|mullet|porgy|drum|dover sole|bombay duck|shark|salt cod|bacalao|boquerone|tuna"],

  // ── Meat ─────────────────────────────────────────────────────────────────────────────────────
  ["snacks", "jerky|biltong|meat stick|beef stick|slim jim|pork rind|chicharron|cracklin"],
  ["meat", "chicken|beef|pork|lamb|mutton|goat|veal|turkey|duck|goose|quail|pheasant|partridge|grouse|pigeon|squab|guinea fowl|cornish hen|poussin|rabbit|hare|venison|bison|buffalo meat|elk|boar|wild boar|reindeer|kangaroo|alligator|crocodile|frog leg|ham|bacon|pancetta|prosciutto|guanciale|speck|jamon|lardon|salami|pepperoni|chorizo|sobrasada|nduja|sausage|saucisse|bratwurst|brat|weisswurst|knackwurst|kielbasa|andouille|chipolata|boudin|hot dog|frank|frankfurter|wiener|bologna|mortadella|capicola|coppa|soppressata|pastrami|corned beef|roast beef|deli meat|lunch meat|luncheon meat|cold cut|liverwurst|scrapple|steak|ribeye|rib eye|sirloin|tenderloin|filet mignon|chateaubriand|entrecote|porterhouse|t bone|strip steak|new york strip|flank|skirt|hanger|flat iron|tri tip|picanha|brisket|chuck|round|rump|london broil|short rib|rib|spare rib|baby back|oxtail|shank|osso buco|chop|cutlet|scaloppine|schnitzel|escalope|roast|pot roast|prime rib|rack of lamb|leg of lamb|ground meat|mince|meatball|meatloaf|burger|patty|liver|kidney|heart|gizzard|giblet|tripe|tongue|sweetbread|marrow|marrow bone|soup bone|bone|neck|trotter|pig foot|ham hock|hock|fatback|salt pork|suet|schmaltz|lard|dripping|drumstick|drumette|thigh|wing|breast|leg|leg quarter|tender|gammon|carnitas|pulled pork|rotisserie|biltong|gyro|shawarma|kebab|kabob|kofta|(?:beef|chicken|pork|lamb|steak|turkey|meat) (?:skewer|kabob|kebab)|meat"],

  // ── Dairy & eggs ─────────────────────────────────────────────────────────────────────────────
  ["dairy", "egg substitute|egg replacer|liquid egg|egg white|egg yolk|eggbeater|egg|eggnog|milk|buttermilk|kefir|lassi|yogurt|yoghurt|skyr|quark|labneh|tzatziki|raita|butter|buttery spread|margarine|clarified butter|cream|cheese|cheddar|mozzarella|parmesan|parmigiano|parmigiano reggiano|grana padano|romano|pecorino|asiago|provolone|gouda|edam|brie|camembert|feta|ricotta|mascarpone|burrata|bocconcini|halloumi|paneer|gruyere|comte|havarti|muenster|munster|fontina|manchego|gorgonzola|roquefort|stilton|blue cheese|emmental|emmentaler|jarlsberg|colby|monterey jack|pepper jack|pepperjack|jack|queso|queso fresco|cotija|oaxaca|velveeta|neufchatel|boursin|taleggio|raclette|limburger|leicester|gloucester|wensleydale|cheshire|lancashire|caerphilly|chevre|khoa|khoya|curd|custard|pudding|dip"],

  // ── Bakery ───────────────────────────────────────────────────────────────────────────────────
  ["snacks", "tortilla chip|pita chip|bagel chip|naan chip|bread chip|pretzel|cracker|crispbread|rusk|breadstick|grissini|crostini|melba toast|zwieback"],
  ["bakery", "bread|loaf|baguette|boule|batard|ciabatta|focaccia|brioche|challah|sourdough|pumpernickel|rye|bun|roll|kaiser|hoagie|sub|bagel|english muffin|muffin|croissant|danish|scone|donut|doughnut|cruller|fritter|pastry|strudel|turnover|eclair|cream puff|cake|cupcake|cheesecake|pie|tart|galette|brownie|biscuit|cornbread|pita|naan|flatbread|lavash|tortilla|wrap|tostada|taco shell|taco salad shell|arepa|roti|chapati|chapatti|paratha|injera|matzo|matzah|crumpet|sandwich thin|bagel thin|toast|pain|panettone|stollen|babka|kolache|bialy|beignet|churro|waffle|pancake|crepe|blini|dough|crust"],

  // ── Grains, pasta, cereal, dried beans ───────────────────────────────────────────────────────
  ["grains", "dried(?: \\w+)* (?:bean|lentil|pea|chickpea|garbanzo)|dry(?: \\w+)* (?:bean|lentil|pea|chickpea)|lentil|dal|dhal|daal|gram|split pea|urad|moong|masoor|toor|chana|adzuki|azuki|mung bean|moth bean|bengal gram"],
  ["grains", "rice|pasta|spaghetti|spaghettini|penne|rigatoni|fusilli|fusili|rotini|farfalle|bow tie|macaroni|elbow|shell|conchiglie|linguine|fettuccine|fettuccini|angel hair|capellini|vermicelli|lasagna|lasagne|orzo|ziti|orecchiette|pappardelle|tagliatelle|bucatini|gemelli|cavatappi|cavatelli|ditalini|tubetti|tubettini|pastina|anellini|manicotti|cannelloni|mostaccioli|campanelle|radiatori|fregola|fregula|gnocchi|tortellini|tortelloni|ravioli|agnolotti|mezzelune|noodle|udon|soba|lo mein|chow mein|pad thai|spaetzle|quinoa|couscous|barley|farro|bulgur|bulghur|freekeh|millet|sorghum|amaranth|buckwheat|kasha|teff|spelt|kamut|triticale|wheat berry|wheatberry|rye berry|cracked wheat|job tear|oat|oatmeal|porridge|grits|polenta|hominy grits|farina|cereal|granola|muesli|cheerio|corn flake|bran flake|raisin bran|all bran|rice krispy|chex|shredded wheat|grape nut|froot loop|fruit loop|lucky charm|cocoa puff|cocoa krispy|cocoa pebble|fruity pebble|frosted flake|special k|kix|life cereal|captain crunch|capn crunch|mini wheat|golden graham|cinnamon toast crunch|honey bunch of oat|apple jack|corn pop|wheat flake|puffed rice|puffed wheat|shirataki"],

  // ── Baking ───────────────────────────────────────────────────────────────────────────────────
  ["baking", "flour|meal|cornmeal|masa|masa harina|semolina|sugar|sucanat|panela|jaggery|piloncillo|sweetener|sugar alcohol|stevia|splenda|sucralose|erythritol|xylitol|allulose|monk fruit|swerve|tagatose|sukrin|corn syrup|golden syrup|glucose|yeast|sourdough starter|cocoa|cacao|cocoa nib|cacao nib|chocolate|carob|vanilla|vanilla bean|extract|essence|flavoring|flavouring|gelatin|gelatine|jello|pectin|shortening|crisco|marshmallow|marshmallow creme|marshmallow fluff|fluff|meringue powder|xanthan gum|guar gum|vital wheat gluten|gluten|wheat germ|wheat bran|oat bran|bran|psyllium|citric acid|butterscotch|caramel|toffee|maraschino|glace cherry|almond paste|marzipan|coconut flake|shredded coconut|desiccated coconut|sweetened coconut|flaked coconut|coconut|rose water|orange blossom water|orange flower water|custard powder|starch|egg replacer|chia egg|flax egg|couverture|nougat|praline|streusel|pie weight"],

  // ── Canned & jarred (generic words) ──────────────────────────────────────────────────────────
  ["canned", "baked bean|refried bean|pork and bean|chili bean|bean|chickpea|garbanzo|black eyed pea|blackeyed pea|pigeon pea|pickle|gherkin|cornichon|olive|caper|caper berry|sauerkraut|kimchi|giardiniera|pepperoncini|peperoncini|pimiento|pimento|roasted red pepper|piquillo|artichoke heart|artichoke bottom|heart of palm|water chestnut|bamboo shoot|baby corn|creamed corn|sun dried tomato|sundried tomato|green chile|chipotle in adobo|chipotle chile in adobo|grape leaf|vine leaf|preserved lemon|pickled(?: \\w+)+|marinated(?: \\w+)+|mandarin orange|lychee in syrup|in syrup|in juice|in water|in oil|canned|tinned|jarred"],

  // ── Spices & seasonings ──────────────────────────────────────────────────────────────────────
  ["spices", "dried(?: \\w+)* (?:basil|oregano|thyme|rosemary|sage|parsley|dill|cilantro|chive|mint|marjoram|tarragon|bay leaf|herb|epazote|lavender|fenugreek leaf|lemongrass|onion|onion flake|minced onion|garlic|chili|chile|chilli|pepper|arbol|ancho|guajillo|pasilla|chipotle|mulato|new mexico chile|hibiscus|orange peel|lemon peel|savory)|ground (?:\\w+ )*(?:pepper|cinnamon|cumin|coriander|clove|allspice|nutmeg|ginger|cardamom|turmeric|mustard|fennel|fenugreek|mace|sage|thyme|savory|paprika|chile|chili|chipotle|anise|star anise|cayenne|sumac|flaxseed)"],
  ["spices", "spice|seasoning|seasoned salt|salt|pepper flake|red pepper flake|chili flake|chile flake|crushed red pepper|black pepper|white pepper|pink pepper|green peppercorn|peppercorn|cayenne|cayenne pepper|lemon pepper|aleppo pepper|urfa|espelette|long pepper|sichuan pepper|szechuan pepper|paprika|pimenton|cumin|coriander|cinnamon|cinnamon stick|nutmeg|clove|allspice|cardamom|star anise|anise|aniseed|fennel seed|fennel pollen|caraway|mustard seed|mustard powder|dry mustard|celery seed|celery salt|celery flake|garlic powder|garlic salt|granulated garlic|garlic granule|onion powder|onion salt|granulated onion|onion flake|chili powder|chile powder|chipotle powder|ancho powder|turmeric|curry powder|curry leaf powder|garam masala|masala|chaat|five spice|za atar|zaatar|sumac|ras el hanout|berbere|baharat|dukkah|jerk|adobo|sazon|tajin|furikake|togarashi|shichimi|gochugaru|saffron|bay leaf|oregano|thyme|rosemary|sage|marjoram|tarragon|savory|dill weed|dill seed|parsley flake|herbes de provence|herb de provence|italian herb|fine herbes|bouquet garni|old bay|cajun|creole|blackening|taco seasoning|fajita|ranch mix|ranch seasoning|onion soup mix|soup mix|dip mix|gravy mix|sauce mix|seasoning mix|msg|monosodium glutamate|accent|mace|juniper|juniper berry|fenugreek|asafoetida|hing|amchur|amchoor|mango powder|nigella|kalonji|ajwain|carom|annatto|achiote|file|file powder|grain of paradise|sesame seed|poppy seed|dried herb|rub|mrs dash|everything bagel seasoning|nutritional yeast|dashi|pickling spice|crab boil|mulling spice|panch phoron|vegeta|gomashio|shichimi togarashi|lemon salt|smoked salt|truffle salt|fleur de sel|msg"],

  // ── Snacks ───────────────────────────────────────────────────────────────────────────────────
  ["snacks", "chip|crisp|popcorn|cheese puff|cheeto|dorito|frito|pringle|veggie straw|nut|almond|walnut|pecan|cashew|peanut|pistachio|hazelnut|filbert|macadamia|brazil nut|pine nut|pignoli|candlenut|tiger nut|mixed nut|trail mix|snack mix|chex mix|party mix|sunflower seed|sunflower kernel|pumpkin seed|pepita|chia seed|chia|flax|flaxseed|linseed|hemp seed|hemp heart|seed|raisin|craisin|sultana|prune|dried fruit|dried (?:\\w+ )*(?:fruit|apple|apricot|banana|blueberry|cherry|cranberry|currant|date|fig|mango|papaya|peach|pear|pineapple|plum|strawberry|berry|barberry|goji|mulberry|kiwi|persimmon)|goji berry|gummy|gummi|candy|candy bar|chocolate bar|lollipop|licorice|jelly bean|gum drop|gumdrop|spice drop|mint|peppermint patty|chewing gum|gum|fudge|truffle|bonbon|m and ms|mandm|skittle|starburst|snicker|kit kat|twix|reese|reese piece|hershey|hershey kiss|milky way|butterfinger|heath bar|mound|almond joy|nerd|sour patch|swedish fish|twizzler|jolly rancher|tootsie|peep|candy corn|candy cane|conversation heart|malted milk ball|jujube|cookie|oreo|chip ahoy|biscotti|shortbread|wafer|graham cracker|animal cracker|fig newton|amaretti|ladyfinger|gingersnap|macaron|macaroon|granola bar|protein bar|cereal bar|energy bar|snack bar|nut bar|breakfast bar|clif|larabar|rice cake|popchip|seaweed snack|pudding cup|jello cup|pop tart|toaster pastry|snack cake|twinkie|honey bun|cheez it|goldfish|ritz|triscuit|wheat thin|saltine|club cracker|water cracker|oyster cracker|nacho|queso dip|salsa con queso|bean dip|cheese dip|snack"],

  // ── Drinks ───────────────────────────────────────────────────────────────────────────────────
  ["beverages", "water|sparkling water|seltzer|club soda|tonic|tonic water|mineral water|soda|pop|cola|coke|pepsi|sprite|dr pepper|root beer|ginger ale|ginger beer|cream soda|mountain dew|7 up|seven up|fanta|lemonade|limeade|juice|nectar|punch|smoothie|shake|kombucha|coffee|espresso|cold brew|latte|k cup|coffee pod|coffee bean|tea|tea bag|black tea|green tea|white tea|earl grey|english breakfast|darjeeling|assam|oolong|chamomile|sencha|genmaicha|hojicha|lapsang souchong|pu erh|chai|matcha|yerba mate|mate|rooibos|tisane|herbal tea|iced tea|sweet tea|hot chocolate|hot cocoa|cocoa mix|drinking chocolate|ovaltine|drink mix|kool aid|crystal light|gatorade|powerade|bodyarmor|body armor|sport drink|energy drink|red bull|monster energy|celsius|electrolyte|electrolyte drink|liquid iv|lacroix|la croix|bubly|perrier|pellegrino|topo chico|wine|champagne|prosecco|cava|sparkling wine|beer|ale|lager|ipa|stout|porter|pilsner|pils|hefeweizen|lambic|hard seltzer|cider|mead|sake|soju|vodka|gin|genever|rum|tequila|mezcal|whiskey|whisky|bourbon|scotch|brandy|cognac|armagnac|liqueur|liquor|schnapps|vermouth|sherry|port|madeira|marsala|amaro|aperol|campari|bitter|triple sec|cointreau|grand marnier|kahlua|bailey|irish cream|amaretto|frangelico|limoncello|absinthe|ouzo|sambuca|anisette|pernod|pisco|cachaca|grappa|calvados|kirsch|chartreuse|drambuie|galliano|midori|chambord|curacao|creme de \\w+|benedictine|jaegermeister|jagermeister|fernet|suze|lillet|pimm|punt e me|tia maria|licor 43|margarita mix|bloody mary mix|sour mix|simple syrup|grenadine|orgeat|falernum|mixer|cabernet|cabernet sauvignon|merlot|pinot|pinot noir|pinot grigio|chardonnay|sauvignon blanc|riesling|moscato|zinfandel|shiraz|syrah|malbec|chianti|rioja|tempranillo|sangiovese|gewurztraminer|lambrusco|beaujolais|chablis|sangria|spritz|wine cooler|horchata|agua fresca|boba|bubble tea|milk tea|protein shake|meal replacement|soylent|ensure|alcohol|spirit|drink|beverage"],

  // ── Produce (last: most generic words) ───────────────────────────────────────────────────────
  ["produce", "guacamole|pico de gallo|hummus|salsa fresca|fresh salsa|crudite|veggie tray|fruit tray|fruit salad|cut fruit|coleslaw mix|slaw mix|slaw|salad kit|salad mix|spring mix|mesclun|mixed green|baby green|salad green|stir fry vegetable|mirepoix|soffritto|zucchini noodle|zoodle|cauliflower rice|riced cauliflower|spiralized(?: \\w+)+"],
  ["produce", "apple|banana|orange|lemon|lime|grapefruit|clementine|mandarin|tangerine|tangelo|satsuma|cutie|pomelo|kumquat|yuzu|citron|citrus|berry|strawberry|blueberry|raspberry|blackberry|cranberry|gooseberry|boysenberry|huckleberry|lingonberry|elderberry|mulberry|chokeberry|currant|grape|cherry|peach|nectarine|plum|pluot|apricot|mango|papaya|pineapple|kiwi|kiwifruit|melon|watermelon|cantaloupe|honeydew|muskmelon|fig|date|pomegranate|persimmon|guava|passion fruit|passionfruit|dragon fruit|pitaya|lychee|litchi|longan|rambutan|mangosteen|durian|jackfruit|breadfruit|starfruit|carambola|quince|pear|avocado|plantain|tamarind|rhubarb|cherimoya|custard apple|sapote|feijoa|physalis|tomatillo|tomato|potato|yam|sweet potato|onion|shallot|leek|scallion|green onion|spring onion|ramp|chive|garlic|garlic scape|ginger|galangal|turmeric root|carrot|celery|celeriac|celery root|lettuce|romaine|iceberg|arugula|rocket|spinach|kale|chard|swiss chard|collard|collard green|mustard green|turnip green|beet green|dandelion green|green|cabbage|bok choy|pak choi|choy sum|gai lan|napa|broccoli|broccolini|broccoli rabe|rapini|cauliflower|romanesco|brussels sprout|sprout|asparagus|artichoke|green bean|string bean|french bean|haricot vert|runner bean|wax bean|yardlong bean|long bean|snap pea|sugar snap|snow pea|pea shoot|pea|edamame|corn|corn on the cob|zucchini|courgette|squash|pumpkin|gourd|cucumber|eggplant|aubergine|bell pepper|sweet pepper|mini pepper|jalapeno|serrano|poblano|habanero|scotch bonnet|anaheim|fresno|cubanelle|shishito|padron|banana pepper|thai chili|bird eye chili|chili pepper|chile pepper|hot pepper|pepper|chile|chili|mushroom|radish|daikon|beet|beetroot|turnip|parsnip|rutabaga|swede|kohlrabi|fennel|okra|jicama|endive|radicchio|escarole|frisee|watercress|cress|microgreen|lamb lettuce|mache|mizuna|tatsoi|sorrel|purslane|nettle|samphire|sunchoke|jerusalem artichoke|cassava|yuca|taro|malanga|lotus root|burdock|chayote|nopal|nopale|squash blossom|fiddlehead|horseradish root|water spinach|morning glory|moringa|amaranth leaf|herb|basil|thai basil|holy basil|cilantro|coriander leaf|culantro|parsley|mint|spearmint|peppermint|dill|lemongrass|lemon balm|lemon verbena|chervil|lovage|shiso|perilla|curry leaf|lime leaf|kaffir lime leaf|makrut lime leaf|epazote|lavender|salad|vegetable|veggie|fruit|produce"],
]

type CompiledRule = { category: Category; atEnd: RegExp; anywhere: RegExp }

const COMPILED: readonly CompiledRule[] = RULES.map(([category, alternatives]) => ({
  category,
  atEnd: new RegExp(`(?:^| )(?:${alternatives})$`),
  anywhere: new RegExp(`(?:^| )(?:${alternatives})(?= |$)`),
}))

const NON_FOOD_RE = new RegExp(`(?:^| )(?:${NON_FOOD})(?= |$)`)
const NON_FOOD_END_RE = new RegExp(`(?:^| )(?:${NON_FOOD_END})$`)
const FROZEN_RE = /(?:^| )(?:frozen|freezer)(?= |$)/
const CANNED_RE = /(?:^| )(?:canned|tinned|jarred|pickled|can of|tin of|jar of)(?= |$)/
/** "… in water", "… packed in extra virgin olive oil", "… in syrup": sold in a can or jar. */
const PACKED_RE = /(?:^| )(?:in|packed in) (?:\w+ )*(?:water|oil|brine|syrup|juice|tomato sauce)$/
const DRIED_RE = /(?:^| )(?:dried|dehydrated|dry)(?= |$)/
/** "X with Y", "X in Y": X is the thing ("pasta sauce with meat"). */
const CONNECTOR_RE = / (?:with|w|in) /

type EndMatch = { category: Category; length: number }

/** The first rule matching at the end of the phrase, and how many words it matched. */
function matchAtEnd(phrase: string): EndMatch | null {
  for (const rule of COMPILED) {
    const match = rule.atEnd.exec(phrase)
    if (match) return { category: rule.category, length: match[0].trim().split(" ").length }
  }
  return null
}

/** Label words removed; "X with Y" read as X first. */
function endMatch(words: string): { stripped: string; end: EndMatch | null } {
  const stripped = words.replace(MODIFIERS, " ").replace(/ +/g, " ").trim() || words
  const connector = CONNECTOR_RE.exec(stripped)
  const end = (connector && matchAtEnd(stripped.slice(0, connector.index))) || matchAtEnd(stripped)
  return { stripped, end }
}

/**
 * The section a storage word puts a name in, whatever the food: "frozen …" → frozen,
 * "canned …" / "pickled …" / "… in water" → canned, "dried …" → whatever the rules say for the
 * dried thing ("dried mango" → snacks, "dried thyme" → spices). null when there's no such word.
 * Takes folded, singular words joined by spaces.
 */
export function qualifierCategory(words: string): Category | null {
  if (FROZEN_RE.test(words)) return "frozen"
  if (CANNED_RE.test(words) || PACKED_RE.test(words)) return "canned"
  if (DRIED_RE.test(words)) return categoryByRules(words)
  return null
}

/**
 * True for household things that aren't food ("dish soap", "paper towels", "coffee filters",
 * "kitchen sponges"), false for foods that share a word ("sponge cake", "vitamin water").
 * Takes folded, singular words.
 */
export function isNonFoodWords(words: string): boolean {
  if (!words) return false
  if (NON_FOOD_RE.test(words)) return true
  const { stripped, end } = endMatch(words)
  return !end && NON_FOOD_END_RE.test(stripped)
}

/**
 * Grocery section from keyword rules, or null when no rule knows the name.
 * Takes folded, singular words joined by spaces (see ingredientWords in ./normalize).
 */
export function categoryByRules(words: string): Category | null {
  if (!words) return null
  if (NON_FOOD_RE.test(words)) return "other"
  if (FROZEN_RE.test(words)) return "frozen"
  if (CANNED_RE.test(words) || PACKED_RE.test(words)) return "canned"
  const { stripped, end } = endMatch(words)
  if (end) return end.category
  if (NON_FOOD_END_RE.test(stripped)) return "other"
  for (const rule of COMPILED) if (rule.anywhere.test(stripped)) return rule.category
  return null
}

/**
 * For the library build: the food rule that matches the END of the name and how many words it
 * matched ("soy butter" → condiments, 2), so a specific phrase can beat a shorter curated look-alike
 * ("butter"). null when no rule matches at the end. Takes folded, singular words.
 */
export function ruleAtEnd(words: string): EndMatch | null {
  return words ? endMatch(words).end : null
}
