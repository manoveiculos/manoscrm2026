'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    leadId: string;
    leadName?: string;
    onView?: () => void;
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * SafeLeadCard — Error Boundary por card individual.
 *
 * Se um LeadCardV2, KanbanCard ou linha de LeadListV2 crashar,
 * este wrapper renderiza um placeholder "Lead Corrompido" em vez
 * de derrubar a coluna/tabela inteira.
 */
export class SafeLeadCard extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(
            `[SafeLeadCard] Lead "${this.props.leadId}" crashou:`,
            error,
            errorInfo.componentStack
        );
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    onClick={this.props.onView}
                    className="relative p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] cursor-pointer hover:bg-amber-500/[0.06] transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <AlertTriangle size={14} className="text-amber-500" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-amber-400 truncate">
                                {this.props.leadName || `Lead #${this.props.leadId.slice(0, 8)}`}
                            </p>
                            <p className="text-[9px] text-amber-500/50">
                                Dados corrompidos — clique para ver detalhes
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
