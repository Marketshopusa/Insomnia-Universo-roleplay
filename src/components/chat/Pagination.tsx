 import { Button } from "@/components/ui/button";
 import { ChevronLeft, ChevronRight } from "lucide-react";
 
 interface PaginationProps {
   currentPage: number;
   totalPages: number;
   onPageChange: (page: number) => void;
 }
 
 export const Pagination = ({ currentPage, totalPages, onPageChange }: PaginationProps) => {
   return (
     <div className="flex items-center justify-center gap-4">
       <Button
         variant="outline"
         size="sm"
         onClick={() => onPageChange(currentPage - 1)}
         disabled={currentPage <= 1}
         className="gap-1"
       >
         <ChevronLeft className="w-4 h-4" />
         Previous
       </Button>
       
       <span className="text-sm text-muted-foreground">
         Page {currentPage} of {totalPages}
       </span>
       
       <Button
         variant="outline"
         size="sm"
         onClick={() => onPageChange(currentPage + 1)}
         disabled={currentPage >= totalPages}
         className="gap-1"
       >
         Next
         <ChevronRight className="w-4 h-4" />
       </Button>
     </div>
   );
 };