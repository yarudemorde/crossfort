import { useEffect, useState } from "react";
import timing from "../../../data/presentation.settings.json";
export function RoundIndicator({ round }: { round: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(true);
    const timer = setTimeout(() => setShow(false), timing.roundMs);
    return () => clearTimeout(timer);
  }, [round]);
  return show ? (
    <div key={round} className="hx-round-indicator" role="status">
      ROUND <b>{round}</b>
    </div>
  ) : null;
}
