import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { CATEGORIES, type Category } from "@/lib/ingredients/types"
import { cn } from "@/lib/utils"

import { unitOptions } from "../display"

// Touch-sized (44px) with 16px text so iOS doesn't zoom in on focus.
const SELECT = "w-full [&>select]:h-11 [&>select]:pr-7 [&>select]:pl-3 [&>select]:text-base md:[&>select]:text-sm"

type SelectProps = Omit<React.ComponentProps<typeof NativeSelect>, "value" | "onChange" | "children">

export function CategorySelect({
  value,
  onValueChange,
  className,
  ...props
}: SelectProps & { value: Category; onValueChange: (category: Category) => void }) {
  return (
    <NativeSelect
      className={cn(SELECT, className)}
      value={value}
      onChange={(event) => onValueChange(event.target.value as Category)}
      {...props}
    >
      {CATEGORIES.map((category) => (
        <NativeSelectOption key={category.value} value={category.value}>
          {category.emoji} {category.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

export function UnitSelect({
  value,
  onValueChange,
  className,
  ...props
}: SelectProps & { value: string; onValueChange: (unit: string) => void }) {
  return (
    <NativeSelect
      className={cn(SELECT, "[&>select]:pl-2.5", className)}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      {...props}
    >
      {unitOptions(value).map((unit) => (
        <NativeSelectOption key={unit.value} value={unit.value}>
          {unit.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
