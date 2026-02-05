 import storyCover1 from "@/assets/story-cover-1.jpg";
 import storyCover2 from "@/assets/story-cover-2.jpg";
 import storyCover3 from "@/assets/story-cover-3.jpg";
 import storyCover4 from "@/assets/story-cover-4.jpg";
 
 export const storyImages: Record<string, string> = {
   "Early Arrival": storyCover1,
   "Mysterious Stranger": storyCover2,
   "Gradual Descent": storyCover3,
   "Midnight Encounter": storyCover4,
   "Natural Connection": storyCover1,
   "Late-night Adventure": storyCover4,
   "Sweet Desires": storyCover2,
   "Photo Session": storyCover1,
   "Power Play": storyCover3,
   "Hidden Desires": storyCover2,
   "Sisterhood": storyCover1,
   "Festival Dreams": storyCover4,
 };
 
 export const getStoryImage = (title: string): string | null => {
   return storyImages[title] || null;
 };