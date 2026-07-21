import { motion, useReducedMotion } from 'motion/react';

const words = [
  { text: 'Hello', x: '10%', y: '20%', delay: 0, color: '#6366f1' },
  { text: 'Hola', x: '85%', y: '15%', delay: 0.2, color: '#ec4899' },
  { text: 'Bonjour', x: '15%', y: '75%', delay: 0.4, color: '#8b5cf6' },
  { text: 'こんにちは', x: '80%', y: '70%', delay: 0.6, color: '#06b6d4' },
  { text: 'Ciao', x: '50%', y: '10%', delay: 0.3, color: '#f59e0b' },
  { text: 'გამარჯობა', x: '90%', y: '45%', delay: 0.5, color: '#10b981' }  
];

const mobileWords = [
  { text: 'Hello', x: '6%', y: '8%', delay: 0.1, color: '#6b7280', duration: 24 },
  { text: 'Hola', x: '86%', y: '12%', delay: 0.3, color: '#6b7280', duration: 26 },
  { text: 'Bonjour', x: '8%', y: '82%', delay: 0.2, color: '#6b7280', duration: 22 },
  { text: 'Ciao', x: '88%', y: '88%', delay: 0.4, color: '#6b7280', duration: 25 },
];

export function FloatingWords() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {mobileWords.map((word, index) => (
        shouldReduceMotion ? (
          <div
            key={`mobile-static-${index}`}
            style={{
              position: 'absolute',
              left: word.x,
              top: word.y,
              color: word.color,
              fontSize: '1.3rem',
              fontWeight: '400',
              opacity: 0.18,
            }}
            className="md:hidden"
          >
            {word.text}
          </div>
        ) : (
          <motion.div
            key={`mobile-${index}`}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0.14, 0.22, 0.14],
            y: [0, -18, 0],
            }}
            transition={{
              duration: word.duration,
              delay: word.delay,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            style={{
              position: 'absolute',
              left: word.x,
              top: word.y,
              color: word.color,
              fontSize: '1.3rem',
              fontWeight: '400',
            }}
            className="md:hidden"
          >
            {word.text}
          </motion.div>
        )
      ))}
      {words.map((word, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ 
            opacity: [0.15, 0.25, 0.15],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 8,
            delay: word.delay,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{
            position: 'absolute',
            left: word.x,
            top: word.y,
            color: word.color,
            fontSize: '1.5rem',
            fontWeight: '500',
          }}
          className="hidden md:block"
        >
          {word.text}
        </motion.div>
      ))}
    </div>
  );
}
