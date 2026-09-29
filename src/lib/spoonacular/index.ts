import "server-only"

export {
  isSpoonacularConfigured,
  spoonacularFetch,
  SpoonacularError,
  type SpoonacularErrorCode,
  type SpoonacularQuota,
  type SpoonacularRequest,
} from "./client"
export {
  parseIngredients,
  type ParseIngredientsResult,
  type SpoonacularIngredient,
} from "./parse-ingredients"
export {
  findRecipesByIngredients,
  getRecipeInformation,
  MEAL_TYPES,
  searchRecipes,
  type MealType,
  type RecipeDetail,
  type RecipeIngredient,
  type RecipeList,
  type RecipeSearch,
  type RecipeSummary,
} from "./recipes"
