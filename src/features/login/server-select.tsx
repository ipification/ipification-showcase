"use client";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { AuthServer } from "@/shared/contracts";
export function ServerSelect({
  servers,
  value,
  onChange,
}: {
  servers: AuthServer[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (servers.length < 2) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Authentication server" className="min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {servers.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
