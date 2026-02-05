 import { useState } from "react";
 import { useNavigate, Link } from "react-router-dom";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { signUp } from "@/lib/auth";
 import { useToast } from "@/hooks/use-toast";
 import { MainLayout } from "@/components/layout/MainLayout";
 
 const Register = () => {
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [username, setUsername] = useState("");
   const [loading, setLoading] = useState(false);
   const navigate = useNavigate();
   const { toast } = useToast();
 
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     setLoading(true);
 
     const { error } = await signUp(email, password, username);
 
     if (error) {
       toast({
         title: "Error",
         description: error.message,
         variant: "destructive",
       });
     } else {
       toast({
         title: "Account created!",
         description: "Please check your email to verify your account.",
       });
       navigate("/login");
     }
 
     setLoading(false);
   };
 
   return (
     <MainLayout>
       <div className="flex min-h-[80vh] items-center justify-center px-4">
         <Card className="w-full max-w-md">
           <CardHeader className="text-center">
             <CardTitle className="text-2xl font-display">Create Account</CardTitle>
             <CardDescription>Sign up to get started with Erota</CardDescription>
           </CardHeader>
           <CardContent>
             <form onSubmit={handleSubmit} className="space-y-4">
               <div className="space-y-2">
                 <Label htmlFor="username">Username</Label>
                 <Input
                   id="username"
                   type="text"
                   placeholder="Your username"
                   value={username}
                   onChange={(e) => setUsername(e.target.value)}
                   required
                 />
               </div>
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
                   minLength={6}
                 />
               </div>
               <Button type="submit" className="w-full" disabled={loading}>
                 {loading ? "Creating account..." : "Sign Up"}
               </Button>
             </form>
             <p className="mt-4 text-center text-sm text-muted-foreground">
               Already have an account?{" "}
               <Link to="/login" className="text-primary hover:underline">
                 Sign in
               </Link>
             </p>
           </CardContent>
         </Card>
       </div>
     </MainLayout>
   );
 };
 
 export default Register;