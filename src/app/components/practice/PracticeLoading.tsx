import { motion } from "motion/react";

interface PracticeLoadingProps {
  message: string;
}

export function PracticeLoading({ message }: PracticeLoadingProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full mb-4"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
      <p className="text-muted-foreground animate-pulse">{message}</p>
    </div>
  );
}
