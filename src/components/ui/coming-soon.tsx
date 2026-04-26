import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-5">
        <Construction size={24} className="text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
        {description ?? "This feature is under development and will be available in a future update."}
      </p>
    </div>
  );
}
