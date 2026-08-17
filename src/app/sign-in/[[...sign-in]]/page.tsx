import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto shadow-2xl rounded-2xl overflow-hidden",
            card: "bg-card border border-border/30 backdrop-blur-xl text-foreground",
          },
        }}
      />
    </div>
  );
}
