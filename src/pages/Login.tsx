 import { useState } from "react";
 import { useNavigate, Link } from "react-router-dom";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { signIn } from "@/lib/auth";
 import { useToast } from "@/hooks/use-toast";
 import { MainLayout } from "@/components/layout/MainLayout";
 
 const Login = () => {
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [loading, setLoading] = useState(false);
   const navigate = useNavigate();
   const { toast } = useToast();
 
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     setLoading(true);
 
     const { error } = await signIn(email, password);
 
     if (error) {
       toast({
         title: "Error",
         description: error.message,
         variant: "destructive",
       });
     } else {
       toast({
         title: "Welcome back!",
         description: "You have successfully logged in.",
       });
       navigate("/");
     }
 
     setLoading(false);
   };
 
   return (
     <MainLayout>
       <div className="flex min-h-[80vh] items-center justify-center px-4">
         <Card className="w-full max-w-md">
           <CardHeader className="text-center">
             <CardTitle className="text-2xl font-display">Welcome Back</CardTitle>
             <CardDescription>Sign in to your account to continue</CardDescription>
           </CardHeader>
           <CardContent>
             <form onSubmit={handleSubmit} className="space-y-4">
               <div className="space-y-2">
                 <Label htmlFor="email">Email</Label>
                 <Input
                   id="email"
                   type="email"
                   placeholder="you@example.com"
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   required
                 />
               </div>
               <div className="space-y-2">
                 <Label htmlFor="password">Password</Label>
                 <Input
                   id="password"
                   type="password"
                   value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   required
                 />
               </div>
               <Button type="submit" className="w-full" disabled={loading}>
                 {loading ? "Signing in..." : "Sign In"}
               </Button>
             </form>
             <p className="mt-4 text-center text-sm text-muted-foreground">
               Don't have an account?{" "}
               <Link to="/register" className="text-primary hover:underline">
                 Sign up
               </Link>
             </p>
           </CardContent>
         </Card>
       </div>
     </MainLayout>
   );
 };
 
 export default Login;