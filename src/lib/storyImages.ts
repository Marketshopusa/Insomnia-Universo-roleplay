 import storyCover1 from "@/assets/story-cover-1.jpg";
 import storyCover2 from "@/assets/story-cover-2.jpg";
 import storyCover3 from "@/assets/story-cover-3.jpg";
 import storyCover4 from "@/assets/story-cover-4.jpg";
 
 export const storyImages: Record<string, string> = {
   "Early Arrival": storyCover1,
   "Girlfriend Discovers Trans Women": storyCover2,
   "Gradual Descent": storyCover3,
   "Midnight Gym: clothing optional": storyCover4,
   "Natural Lubricant": storyCover1,
   "Late-night swim": storyCover2,
   "Craving Cream": storyCover3,
   "Secret Admirer": storyCover4,
   "Office Hours": storyCover1,
   "Beach Rendezvous": storyCover2,
   "Hotel Stranger": storyCover3,
   "First Day at College": storyCover4,
   "Gym Partners": storyCover1,
   "The Massage": storyCover2,
   "Blind Date": storyCover3,
   "Costume Party": storyCover4,
   "Road Trip": storyCover1,
   "Sauna Session": storyCover2,
   "Neighbors": storyCover3,
   "Dance Floor": storyCover4,
   "Study Session": storyCover1,
   "Flight Attendant": storyCover2,
   "Summer Camp": storyCover3,
   "Wedding Guest": storyCover4,
   "Personal Trainer": storyCover1,
   "Art Model": storyCover2,
   "Coffee Date": storyCover3,
   "Halloween Night": storyCover4,
   "Yoga Instructor": storyCover1,
   "Boss and Secretary": storyCover2,
   "Space Station": storyCover3,
   "Confession Booth": storyCover4,
   "Roommate Agreement": storyCover1,
   "Delivery Driver": storyCover2,
   "Casino Night": storyCover3,
   "Lifeguard Duty": storyCover4,
   "Professor Fantasy": storyCover1,
   "Hiking Trail": storyCover2,
   "Bachelor Party": storyCover3,
   "Nurse Fantasy": storyCover4,
 };
 
 export const getStoryImage = (title: string): string | null => {
   return storyImages[title] || null;
 };