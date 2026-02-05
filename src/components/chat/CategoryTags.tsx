 import { cn } from "@/lib/utils";
 
 interface Category {
   id: string;
   name: string;
   slug: string;
 }
 
 interface CategoryTagsProps {
   categories: Category[];
   selectedCategories: string[];
   onCategoryToggle: (categoryId: string) => void;
 }
 
 export const CategoryTags = ({
   categories,
   selectedCategories,
   onCategoryToggle,
 }: CategoryTagsProps) => {
   return (
     <div className="flex flex-wrap gap-2">
       {categories.map((category) => (
         <button
           key={category.id}
           onClick={() => onCategoryToggle(category.id)}
           className={cn(
             "px-3 py-1.5 text-sm rounded-full border transition-all",
             selectedCategories.includes(category.id)
               ? "bg-primary text-primary-foreground border-primary"
               : "bg-secondary text-muted-foreground border-border hover:border-primary hover:text-foreground"
           )}
         >
           {category.name}
         </button>
       ))}
     </div>
   );
 };