"use client";

import { usePrivacy } from "@/components/privacy-context";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

interface PrivacyToggleProps {
  className?: string;
}

export function PrivacyToggle({ className }: PrivacyToggleProps) {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={togglePrivacyMode}
      className={`h-8 w-8 ${className || ""}`}
      title={isPrivacyMode ? "Show Values" : "Hide Values"}
    >
      {isPrivacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      <span className="sr-only">Toggle privacy mode</span>
    </Button>
  );
}
