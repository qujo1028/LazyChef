// A food emoji per ingredient: 🥚 for eggs, 🧈 for butter, 🍗 for chicken thighs, instead of the
// grocery section's emoji (🥛 for all of dairy & eggs).
//
// Pure and client-safe: it imports the name normalizer directly, not catalog.ts, because catalog.ts
// pulls in the whole ingredient library. Only Unicode ≤ 15.1 food emojis that render natively on
// iOS 17+ and Android 14+ (see EMOJI_ALLOW_LIST). The table is parsed once, on first use.
import { normalizeIngredientName } from "./library/normalize"
import { CATEGORY_META, type Category } from "./types"

/** Anything with a name: a typed string, a pantry item, a list line or a library entry. */
export type EmojiSource =
  | string
  | { name: string; category?: Category | null; aliases?: readonly string[] | null }

/**
 * The emoji for an ingredient. Looks up the normalized name (then a library entry's aliases), then
 * the name without its leading words, longest first ("cherry tomatoes" → 🍅, "boneless chicken
 * thighs" → 🍗). Falls back to the category's emoji, or 📦 for a bare string nothing matched.
 */
export function ingredientEmoji(item: EmojiSource): string {
  const source = typeof item === "string" ? { name: item } : item
  const names = source.aliases?.length ? [source.name, ...source.aliases] : [source.name]
  return findEmoji(names) || (CATEGORY_META[source.category ?? "other"] ?? CATEGORY_META.other).emoji
}

/** Every emoji the table may use (the category emojis are allowed as fallbacks). */
export const EMOJI_ALLOW_LIST: ReadonlySet<string> = new Set([
  ..."🍎🍏🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝",
  ..."🍅🍆🥑🫛🥦🥬🥒🫑🌽🥕🫒🧄🧅🥔🍠🫚🍄🥜🫘🌰🌿",
  "🌶️",
  ..."🍞🥐🥖🫓🥨🥯🥞🧇🍚🍝🍜🌾🥣",
  ..."🥩🍗🍖🥓🌭🍔🐟🦐🦞🦀🦑🦪🍤🍣",
  ..."🥚🧀🧈🥛🍦",
  ..."🧂🍯🫙🥫🍫🍪🍩🍰🧁🍿🥤🧃☕🍵🧋🍷🍺🥂🥃🧊",
])

// One line per emoji: the emoji, a space, then comma-separated names. Names are normalized on load
// (plurals and filler words are fine). A name matches exactly or as the end of a longer name, so
// "tomato" also covers "cherry tomatoes". "-" names stop that and use the category emoji instead:
// "peanut butter" isn't 🧈 and "baking soda" isn't 🥤.
// Only map what's genuinely right or very close; the category emoji beats a misleading one.
const TABLE = `
🍎 apple,applesauce,apple sauce,honeycrisp
🍏 green apple,granny smith apple
🍐 pear
🍊 orange,mandarin,clementine,tangerine,satsuma,grapefruit
🍋 lemon,lime,lemon juice,lime juice
🍌 banana,plantain
🍉 watermelon
🍇 grape,raisin
🍓 strawberry
🫐 blueberry,blackberry,berry,mixed berry
🍈 melon,cantaloupe,honeydew
🍒 cherry
🍑 peach,nectarine,apricot
🥭 mango
🍍 pineapple,pineapple in juice,pineapple with juice
🥥 coconut,coconut milk,coconut cream,coconut water,coconut flake
🥝 kiwi,kiwifruit,kiwi fruit
🍅 tomato,diced tomato,diced tomato with green chilies,tomatoes and green chiles,tomatoes in juice
🍆 eggplant,aubergine
🥑 avocado,guacamole
🫛 pea,snow pea,snap pea,green bean,string bean,snap bean,wax bean,haricot vert,edamame,edamame bean,mangetout
🥦 broccoli,broccolini,broccoli floret,broccoli crown
🥬 lettuce,romaine,romaine heart,hearts of romaine,iceberg lettuce,spinach,kale,arugula,bok choy,pak choi,cabbage,chard,collard green,collards,spring mix,mixed greens,salad greens,mesclun,watercress,brussels sprout
🥒 cucumber,zucchini,courgette,pickle,gherkin,cornichon
🌶️ chili pepper,chile pepper,chilli pepper,hot pepper,chile,chilli,green chili,red chili,thai chili,jalapeno,jalapeno pepper,habanero,habanero pepper,serrano,serrano pepper,poblano,poblano pepper,fresno pepper
🫑 bell pepper,peppers,sweet pepper,green pepper,red pepper,yellow pepper,orange pepper,capsicum,mini pepper,snacking pepper
🌽 corn,corn on the cob,ear of corn,baby corn
🥕 carrot
🫒 olive,kalamata
🧄 garlic,garlic clove,garlic bulb
🧅 onion,shallot
🥔 potato,hash brown,hashbrown
🍠 sweet potato,yam
🫚 ginger,ginger root,gingerroot
🍄 mushroom,shiitake,portobello,cremini,crimini
🥜 peanut,peanut butter,nut,mixed nuts
🫘 bean,chickpea,chick pea,blackeyed pea,garbanzo,lentil,black eyed pea
🌰 chestnut,almond,walnut,pecan,cashew,pistachio,hazelnut,filbert,macadamia,macadamia nut,pine nut,pinon nut,pistachio nut,cashew nut,brazil nut
🌿 herb,basil,basil leaves,cilantro,fresh coriander,coriander leaves,parsley,dill,mint,mint leaves,spearmint,chive,rosemary,thyme,thyme leaves,sage,oregano,oregano leaves,tarragon,marjoram,lemongrass,bay leaf,curry leaf,kaffir lime leaf
🍞 bread,loaf,toast,sourdough,brioche,ciabatta,focaccia
🥐 croissant,crescent roll
🥖 baguette,french bread
🫓 flatbread,flat bread,naan,naan bread,pita,pita bread,pita pocket,tortilla,wrap,lavash
🥨 pretzel
🥯 bagel
🥞 pancake,pancake mix,pancake and waffle mix
🧇 waffle,waffle mix,eggo
🍚 rice
🍝 pasta,spaghetti,spaghetti noodles,penne,linguine,linguini,fettuccine,fettuccini,fettucine,rigatoni,rotini,fusilli,farfalle,ziti,orzo,macaroni,elbow noodles,macaroni noodles,angel hair,capellini,lasagna,lasagne,lasagna noodles,lasagne noodles,lasagna sheets,lasagne sheets,pasta shells,shell pasta,conchiglie,tortellini,ravioli,gnocchi,mac and cheese,macaroni and cheese,mac n cheese
🍜 noodle,ramen,udon,soba,lo mein,pho,rice stick,vermicelli,chow mein
🌾 flour,barley,bulgur,wheat berry
🥣 cereal,oat,oatmeal,granola,muesli,porridge,grits,cream of wheat,cheerio,corn flake,cornflake,frosted flake,froot loop,fruit loop,lucky charm,raisin bran,rice krispies,cap n crunch,captain crunch,cinnamon toast crunch,crunch berries,mini wheat
🥩 steak,beef,ribeye,sirloin,filet mignon,brisket,chuck roast,pot roast,stew meat,new york strip,ny strip,pork,veal,venison,bison,jerky,ground chuck
🍗 chicken,chicken breast,chicken thigh,chicken leg,chicken drumstick,drumstick,chicken wing,wing,chicken tender,chicken tenderloin,chicken cutlet,chicken strip,chicken finger,chicken nugget,nugget,popcorn chicken,turkey,turkey breast,turkey leg,duck,duck breast,cornish hen
🍖 ham,rib,chop,rack of lamb,leg of lamb
🥓 bacon,pancetta,pork belly
🌭 hot dog,frank,frankfurter,wiener,bratwurst,brat,corn dog
🍔 burger
🐟 fish,fish fillet,fish stick,fish finger,fish cake,salmon,salmon steak,lox,tuna,tuna steak,cod,tilapia,catfish,halibut,halibut steak,trout,sea bass,bass,mahi mahi,mahi,sardine,anchovy,snapper,swordfish,haddock,pollock,mackerel,herring,flounder,sole
🍤 shrimp,prawn,shrimp cocktail,popcorn shrimp,tempura
🦞 lobster,lobster tail,crawfish,crayfish,langoustine
🦀 crab,crab leg,crab meat,crabmeat,crab stick,crab cake,crab cluster,surimi,krab
🦑 squid,calamari
🦪 oyster,clam,mussel,scallop
🍣 sushi,sashimi,sushi roll,california roll
🥚 egg,egg white,liquid egg
🧀 cheese,cheddar,mozzarella,parmesan,parm,parmigiano,parmigiano reggiano,brie,gouda,feta,provolone,ricotta,mascarpone,paneer,velveeta,queso,queso fresco,cotija,halloumi,gruyere,manchego,pecorino,romano,asiago,emmental,havarti,camembert,colby,colby jack,monterey jack,pepper jack,pepperjack,swiss,burrata,chevre,neufchatel,cheese curd
🧈 butter,margarine,ghee,oleo
🥛 milk,buttermilk,half and half,heavy cream,whipping cream,kefir,lactaid
🍦 ice cream,ice cream bar,ice cream sandwich,ice cream cone,gelato,frozen yogurt,soft serve,sherbet,sorbet
🧂 salt
🍯 honey,honeycomb
🫙 jam,jelly,preserves,marmalade,pesto,salsa,mayonnaise,mayo,ketchup,mustard,relish,pasta sauce,marinara,marinara sauce,alfredo sauce
🥫 soup,broth,stock,spam
🍫 chocolate,chocolate bar,chocolate chip,choc chip,chocolate morsel,candy bar,peanut butter cup
🍪 cookie,oreo,biscotti,vanilla wafer,nilla wafer
🍩 donut,doughnut
🍰 cake,cheesecake
🧁 cupcake,muffin
🍿 popcorn,popcorn kernel,popping corn,kettle corn
🥤 soda,cola,coke,soft drink,energy drink,sports drink,club soda,cream soda,smoothie,milkshake,root beer,ginger ale,ginger beer,lemonade
🧃 juice,juice box
☕ coffee,coffee bean,coffee pod,espresso,cold brew,iced coffee
🍵 tea,tea bag,matcha,chai,iced tea
🧋 bubble tea,boba,milk tea
🍷 wine,cooking wine,sherry,marsala,rice wine,shaoxing wine
🍺 beer,ale,lager
🥂 champagne,prosecco,sparkling wine,cava
🥃 whiskey,whisky,bourbon,scotch,rum,tequila,vodka,gin,brandy,cognac,mezcal,liquor,liqueur
🧊 ice,ice cube
- almond butter,cashew butter,sunflower butter,sunbutter,nut butter,apple butter,cookie butter,cocoa butter,shea butter,body butter
- almond flour,almond meal,almond meal flour,coconut flour,rice flour,chickpea flour,oat flour,potato flour,tapioca flour,cassava flour,buckwheat flour,masa flour,corn masa flour,gluten free flour,gf flour,gluten free all purpose flour,1 to 1 flour
- cauliflower rice,rice cake,english muffin,water chestnut,jelly bean,vanilla bean,cocoa bean,juniper berry,caper berry
- allspice berry,better than bouillon chicken,chili with beans,chili without beans,everything bagel seasoning,everything but the bagel,everything seasoning,granulated garlic,granulated onion,montreal steak,evaporated cane juice
- green onion,spring onion,salad onion,celery rib,celery stalk,crushed red pepper,cayenne pepper,coriander,ground ginger,dried ginger,powdered ginger
- baking soda,bicarb soda,bicarbonate of soda,clam juice,pickle juice,breath mint,candy corn,epsom salt,bath salt,petroleum jelly,plastic wrap,cling wrap,saran wrap,cauliflower steak
`

/** Normalized name → emoji, or "" for "use the category". */
let table: Map<string, string> | null = null

function getTable(): Map<string, string> {
  if (table) return table
  table = new Map()
  for (const line of TABLE.split("\n")) {
    const space = line.indexOf(" ")
    if (space < 0) continue
    const emoji = line.slice(0, space)
    for (const name of line.slice(space + 1).split(",")) {
      table.set(normalizeIngredientName(name), emoji === "-" ? "" : emoji)
    }
  }
  return table
}

/** An exact name first, then each name without its leading words, longest first. undefined: no match. */
function findEmoji(names: readonly string[]): string | undefined {
  const map = getTable()
  const keys = names.map(normalizeIngredientName).filter(Boolean)
  for (const key of keys) {
    const hit = map.get(key)
    if (hit !== undefined) return hit
  }
  for (const key of keys) {
    for (let space = key.indexOf(" "); space >= 0; space = key.indexOf(" ", space + 1)) {
      const hit = map.get(key.slice(space + 1))
      if (hit !== undefined) return hit
    }
  }
  return undefined
}

/** For tests: every normalized name in the table with its emoji ("" = use the category). */
export function emojiTableEntries(): [name: string, emoji: string][] {
  return [...getTable()]
}
