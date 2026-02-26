import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface StatsCardProps {
    title: string;
    value: string | number;
    trend?: number;
    icon: LucideIcon;
    color?: string;
    delay?: number;
    href?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
    title,
    value,
    trend,
    icon: Icon,
    color = 'blue',
    delay = 0,
    href
}) => {
    const content = (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay }}
            className="glass-card group relative overflow-hidden rounded-3xl p-7 transition-all hover:scale-[1.02] hover:shadow-primary/10 h-full"
        >
            <div className="flex items-start justify-between">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color === 'red' || color === 'blue' || color === 'indigo'
                            ? 'bg-red-500/10 text-red-500'
                            : color === 'emerald'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : `bg-${color}-500/10 text-${color}-400`
                            } group-hover:scale-110 transition-transform`}>
                            <Icon size={20} />
                        </div>
                        <span className="text-sm font-semibold tracking-wide text-white/50">{title}</span>
                    </div>

                    <div className="space-y-1">
                        <h3 className="text-4xl font-extrabold tracking-tight text-white group-hover:text-glow transition-all">
                            {value}
                        </h3>

                        {trend !== undefined && (
                            <div className={`flex items-center gap-1.5 text-sm font-bold ${trend >= 0 ? "text-emerald-400" : "text-rose-400"
                                }`}>
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5">
                                    {trend >= 0 ? "↑" : "↓"}
                                </span>
                                {Math.abs(trend)}%
                                <span className="font-medium text-white/30">vs anteontem</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Glossy overlay effect */}
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </motion.div>
    );

    if (href) {
        return <Link href={href}>{content}</Link>;
    }

    return content;
};
