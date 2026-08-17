import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <SignUp
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
