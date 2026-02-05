 import { Header } from "./Header";
 import { Footer } from "./Footer";
 
 interface MainLayoutProps {
   children: React.ReactNode;
 }
 
 export const MainLayout = ({ children }: MainLayoutProps) => {
   return (
     <div className="min-h-screen flex flex-col bg-background font-body">
       <Header />
       <main className="flex-1">
         {children}
       </main>
       <Footer />
     </div>
   );
 };