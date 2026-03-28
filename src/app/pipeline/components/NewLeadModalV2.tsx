'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, User, Phone, Car, DollarSign, RefreshCw, Zap, Upload, MessageSquare } from 'lucide-react';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';
import { dataService } from '@/lib/dataService';
import JSZip from 'jszip';

interface NewLeadModalV2Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newLead: any) => void;
    userName?: string;
    consultantId?: string;
}

export function NewLeadModalV2({ isOpen, onClose, onSuccess, userName, consultantId }: NewLeadModalV2Props) {
    const [loading, setLoading] = useState(false);
    const [chatText, setChatText] = useState('');
    const whatsappInputRef = React.useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        vehicle_interest: '',
        valor_investimento: '',
        carro_troca: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.phone) return;

        setLoading(true);
        try {
            const newLead = await dataService.createLead({
                ...formData,
                source: userName ? `Atendimento ${userName}` : 'Registro Manual',
                ai_classification: 'warm',
                ai_score: 0,
                status: 'attempt',
                assigned_consultant_id: consultantId,
                ai_summary: chatText || undefined
            });

            if (newLead) {
                onSuccess(newLead);
                // Fire-and-forget: análise IA inicial em background
                fetch('/api/lead/init-score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId: newLead.id }),
                }).catch(() => {});
                setFormData({ name: '', phone: '', vehicle_interest: '', valor_investimento: '', carro_troca: '' });
                setChatText('');
                onClose();
            }
        } catch (err) {
            console.error("Error creating lead:", err);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: string) => {
        const digits = value.replace(/\D/g, "");
        const amount = parseInt(digits) / 100;
        if (isNaN(amount)) return "";
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(amount);
    };

    const handleWhatsAppImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setLoading(true);
        try {
            const filesArray = Array.from(files);
            let extractedText = "";
            let contactName = "";
            let contactPhone = "";

            // Parser logic
            if (filesArray.some(f => f.name.toLowerCase().endsWith('.zip'))) {
                const zipFile = filesArray.find(f => f.name.toLowerCase().endsWith('.zip'))!;
                const zip = new JSZip();
                const content = await zip.loadAsync(zipFile);
                
                for (const [filename, entry] of Object.entries(content.files)) {
                    if (entry.dir) continue;
                    if (filename.toLowerCase().includes('chat.txt') || filename.toLowerCase().endsWith('.txt')) {
                        const text = await entry.async('text');
                        extractedText += `\n--- ${filename} ---\n${text}`;
                    }
                }
                contactName = zipFile.name.replace('.zip', '').replace(/[-_]/g, ' ');
            } else {
                for (const file of filesArray) {
                    if (file.name.toLowerCase().includes('chat.txt') || file.name.toLowerCase().endsWith('.txt')) {
                        const text = await file.text();
                        extractedText += `\n--- ${file.name} ---\n${text}`;
                    }
                }
                const folderPath = filesArray[0]?.webkitRelativePath || '';
                contactName = folderPath ? folderPath.split('/')[0].replace(/[-_]/g, ' ') : "Lead WhatsApp";
            }

            // Extract phone if exists in name
            const phoneMatch = contactName.match(/\+?(\d[\s\-\(\).]{0,2}){8,}\d/);
            if (phoneMatch) {
                contactPhone = phoneMatch[0].replace(/[\s\-\(\).]/g, '');
                contactName = contactName.replace(phoneMatch[0], '').trim();
            }

            setFormData(prev => ({
                ...prev,
                name: contactName || prev.name,
                phone: formatPhoneBR(contactPhone) || prev.phone
            }));
            setChatText(extractedText);
            alert("Conversa WhatsApp importada com sucesso!");

        } catch (err) {
            console.error("WhatsApp import error:", err);
            alert("Erro ao importar WhatsApp.");
        } finally {
            setLoading(false);
            if (whatsappInputRef.current) whatsappInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-full max-w-xl bg-[#0a0505] border border-red-500/20 rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.15)]"
            >
                <header className="relative p-8 border-b border-white/5 overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 blur-[80px] -mr-32 -mt-32" />
                    <div className="relative flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center">
                                <Plus size={24} className="text-red-500" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Novo Alvo</h2>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Registro Tático de Lead</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <input 
                                type="file"
                                ref={whatsappInputRef}
                                className="hidden"
                                onChange={handleWhatsAppImport}
                                // @ts-ignore
                                webkitdirectory=""
                                directory=""
                            />
                            <button 
                                type="button"
                                onClick={() => whatsappInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/10 border border-emerald-500/30 rounded-xl text-emerald-400 hover:bg-emerald-600/20 transition-all text-[9px] font-black uppercase tracking-widest"
                            >
                                <Upload size={12} />
                                Importar Pasta WhatsApp
                            </button>

                            <button 
                                type="button"
                                onClick={onClose}
                                className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all shadow-xl"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                </header>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                                <User size={10} /> Nome do Cliente
                            </label>
                            <input 
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                placeholder="Ex: Alexandre Gorges"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-red-500/50 transition-all font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                                <Phone size={10} /> WhatsApp
                            </label>
                            <input 
                                type="text"
                                required
                                value={formData.phone}
                                onChange={(e) => setFormData({...formData, phone: formatPhoneBR(e.target.value)})}
                                placeholder="(00) 00000-0000"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-red-500/50 transition-all font-bold"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                            <Car size={10} /> Veículo de Interesse
                        </label>
                        <input 
                            type="text"
                            value={formData.vehicle_interest}
                            onChange={(e) => setFormData({...formData, vehicle_interest: e.target.value})}
                            placeholder="Ex: Corolla XEI 2024"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-red-500/50 transition-all font-bold"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                                <DollarSign size={10} /> Investimento
                            </label>
                            <input 
                                type="text"
                                value={formData.valor_investimento}
                                onChange={(e) => setFormData({...formData, valor_investimento: formatCurrency(e.target.value)})}
                                placeholder="R$ 0,00"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-red-500/50 transition-all font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                                <RefreshCw size={10} /> Carro na Troca
                            </label>
                            <input 
                                type="text"
                                value={formData.carro_troca}
                                onChange={(e) => setFormData({...formData, carro_troca: e.target.value})}
                                placeholder="Ex: Onix 2020"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-red-500/50 transition-all font-bold"
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <button 
                            type="submit"
                            disabled={loading || !formData.name || !formData.phone}
                            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-3 active:scale-[0.98]"
                        >
                            {loading ? (
                                <RefreshCw size={20} className="animate-spin" />
                            ) : (
                                <>
                                    <Zap size={20} fill="white" />
                                    Registrar e Atacar
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
