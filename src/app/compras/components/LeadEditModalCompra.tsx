'use client';

import { useState, useEffect, useRef } from 'react';
import { 
    X, Save, User, Phone, Car, Tag, 
    MessageSquare, Image as ImageIcon, History,
    CheckCircle2, AlertCircle, Plus, Camera, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LeadCompra } from '@/lib/types/compra';
import { compraService } from '@/lib/services/compraService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadEditModalCompraProps {
    isOpen: boolean;
    onClose: () => void;
    lead: LeadCompra;
    onUpdate: () => void;
}

type TabType = 'atendimento' | 'dados' | 'fotos' | 'historico';

export const LeadEditModalCompra = ({ isOpen, onClose, lead, onUpdate }: LeadEditModalCompraProps) => {
    const [activeTab, setActiveTab] = useState<TabType>('atendimento');
    const [formData, setFormData] = useState<Partial<LeadCompra>>({});
    const [newNote, setNewNote] = useState('');
    const [interactions, setInteractions] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && lead) {
            setFormData(lead);
            loadInteractions();
        }
    }, [isOpen, lead]);

    const loadInteractions = async () => {
        if (!lead.id) return;
        const data = await compraService.getInteractions(lead.id);
        setInteractions(data);
    };

    const handleSave = async () => {
        if (!lead.id) return;
        setIsSaving(true);
        setMessage(null);

        try {
            await compraService.updateLead(lead.id, formData);
            
            if (newNote.trim()) {
                await compraService.addInteraction(lead.id, newNote);
                setNewNote('');
                await loadInteractions();
            }

            setMessage({ type: 'success', text: 'Dados atualizados com sucesso!' });
            onUpdate();
            setTimeout(() => setMessage(null), 3000);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Erro ao salvar' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!lead.id) return;
        if (!confirm('Tem certeza que deseja excluir permanentemente este lead? Esta ação não pode ser desfeita.')) return;
        
        setIsSaving(true);
        try {
            await compraService.deleteLead(lead.id);
            onUpdate();
            onClose();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Erro ao excluir' });
            setIsSaving(false);
        }
    };

    const handleAddPhotoClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingPhoto(true);
        setMessage(null);

        try {
            const url = await compraService.uploadPhoto(file);
            const currentFotos = formData.fotos || [];
            setFormData({ ...formData, fotos: [...currentFotos, { url, created_at: new Date().toISOString() }] });
            setMessage({ type: 'success', text: 'Foto carregada com sucesso!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error: any) {
            setMessage({ type: 'error', text: 'Erro ao fazer upload da foto' });
        } finally {
            setIsUploadingPhoto(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removePhoto = (index: number) => {
        const currentFotos = [...(formData.fotos || [])];
        currentFotos.splice(index, 1);
        setFormData({ ...formData, fotos: currentFotos });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />
                
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-4xl bg-[#0a0f18] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight">{formData.nome || 'Lead sem nome'}</h2>
                            <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">
                                {formData.marca} {formData.modelo} • {formData.ano}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="h-10 w-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white/40 hover:text-white transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Tabs Navigation */}
                    <div className="flex px-6 border-b border-white/5 bg-white/[0.02]">
                        {[
                            { id: 'atendimento', icon: MessageSquare, label: 'Atendimento' },
                            { id: 'dados', icon: User, label: 'Dados do Lead' },
                            { id: 'fotos', icon: Camera, label: 'Fotos' },
                            { id: 'historico', icon: History, label: 'Histórico' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
                                    activeTab === tab.id 
                                    ? 'border-red-600 text-white bg-red-600/5' 
                                    : 'border-transparent text-white/30 hover:text-white/60'
                                }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {activeTab === 'atendimento' && (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Nova Nota de Atendimento</label>
                                    <textarea
                                        value={newNote}
                                        onChange={(e) => setNewNote(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 min-h-[120px] font-bold text-sm"
                                        placeholder="Digite aqui o que foi conversado com o cliente..."
                                    />
                                </div>
                                
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Notas Recentes</h3>
                                    {interactions.length === 0 ? (
                                        <div className="p-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                                            <p className="text-white/20 text-sm font-bold">Nenhuma nota registrada ainda.</p>
                                        </div>
                                    ) : (
                                        interactions.map((node, i) => (
                                            <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-red-500 uppercase">{node.consultant_name || 'Consultor'}</span>
                                                    <span className="text-[10px] text-white/30 font-bold">{format(new Date(node.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}</span>
                                                </div>
                                                <p className="text-sm text-white/80 font-medium leading-relaxed">{node.notes}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'dados' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Informações Pessoais</h3>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Nome</label>
                                        <input
                                            type="text"
                                            value={formData.nome || ''}
                                            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-bold"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Telefone</label>
                                        <input
                                            type="text"
                                            value={formData.telefone || ''}
                                            onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-bold"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Cidade</label>
                                        <input
                                            type="text"
                                            value={formData.cidade || ''}
                                            onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-bold placeholder:text-white/10"
                                            placeholder="Ex: Itajaí"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Veículo & Negociação</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Valor Cliente</label>
                                            <input
                                                type="number"
                                                value={formData.valor_cliente || ''}
                                                onChange={(e) => setFormData({ ...formData, valor_cliente: Number(e.target.value) })}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-bold"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Valor FIPE</label>
                                            <input
                                                type="number"
                                                value={formData.valor_fipe || ''}
                                                onChange={(e) => setFormData({ ...formData, valor_fipe: Number(e.target.value) })}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Valor Negociado (Proposta)</label>
                                        <input
                                            type="number"
                                            value={formData.valor_negociado || ''}
                                            onChange={(e) => setFormData({ ...formData, valor_negociado: Number(e.target.value) })}
                                            className="w-full bg-red-600/10 border border-red-600/30 rounded-xl p-3 text-white text-sm font-bold"
                                            placeholder="Ex: 30000"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Interesses (Modelos/Marcas)</label>
                                        <input
                                            type="text"
                                            value={formData.interesses || ''}
                                            onChange={(e) => setFormData({ ...formData, interesses: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-bold"
                                            placeholder="Ex: Jeep Compass, Toyota Corolla"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'fotos' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Galeria de Fotos</h3>
                                    
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileChange} 
                                        className="hidden" 
                                        accept="image/*"
                                    />

                                    <button 
                                        onClick={handleAddPhotoClick}
                                        disabled={isUploadingPhoto}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        {isUploadingPhoto ? (
                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Plus size={14} />
                                        )}
                                        {isUploadingPhoto ? 'Enviando...' : 'Adicionar Foto'}
                                    </button>
                                </div>

                                {(!formData.fotos || formData.fotos.length === 0) ? (
                                    <div className="aspect-video bg-white/5 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4">
                                        <div className="p-4 bg-white/5 rounded-2xl text-white/20">
                                            <ImageIcon size={40} />
                                        </div>
                                        <p className="text-white/20 text-sm font-bold">Nenhuma foto anexada a este veículo.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {formData.fotos.map((foto, idx) => (
                                            <div key={idx} className="relative group aspect-square bg-white/5 rounded-2xl overflow-hidden border border-white/10">
                                                <img src={foto.url} alt="Veículo" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-3">
                                                    <button 
                                                        onClick={() => removePhoto(idx)}
                                                        className="p-2 bg-red-500 rounded-lg text-white hover:bg-red-600 transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'historico' && (
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Atividades da IA e Sistema</h3>
                                <div className="space-y-2">
                                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                                        <p className="text-[10px] font-black text-red-500 uppercase mb-1">Resumo da IA</p>
                                        <p className="text-sm text-white/70 font-medium">{formData.ai_summary || 'Nenhum resumo gerado.'}</p>
                                    </div>
                                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                                        <p className="text-[10px] font-black text-red-500 uppercase mb-1">Próxima Ação Sugerida</p>
                                        <p className="text-sm text-white/70 font-medium">{formData.next_step || 'Aguardando próxima análise.'}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-white/40 border border-white/10">Score IA: {formData.ai_score}</span>
                                        <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-white/40 border border-white/10">Origem: {formData.origem}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
                        <div className="flex gap-4">
                            <select 
                                value={formData.prioridade || 0}
                                onChange={(e) => setFormData({ ...formData, prioridade: Number(e.target.value) })}
                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs font-bold focus:outline-none focus:border-red-500 transition-all"
                            >
                                <option value={1} className="bg-[#0a0f18]">🔥 Prioridade Quente</option>
                                <option value={0} className="bg-[#0a0f18]">⚪ Normal</option>
                                <option value={-1} className="bg-[#0a0f18]">🗑️ Descartar / Lixo</option>
                            </select>

                            <select 
                                value={formData.status || 'novo'}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs font-bold focus:outline-none focus:border-red-500 transition-all"
                            >
                                <option value="novo" className="bg-[#0a0f18]">Novo</option>
                                <option value="em_analise" className="bg-[#0a0f18]">Em Análise</option>
                                <option value="proposta_enviada" className="bg-[#0a0f18]">Proposta Enviada</option>
                                <option value="agendado" className="bg-[#0a0f18]">Agendado</option>
                                <option value="vistoria" className="bg-[#0a0f18]">Vistoria</option>
                                <option value="fechado" className="bg-[#0a0f18]">Fechado</option>
                                <option value="perdido" className="bg-[#0a0f18]">Perdido</option>
                            </select>
                        </div>

                        {message && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className={`px-4 py-2 rounded-xl flex items-center gap-2 ${
                                    message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                }`}
                            >
                                {message.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                <p className="text-[10px] font-black uppercase tracking-widest">{message.text}</p>
                            </motion.div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={isSaving}
                                className="px-6 py-3 bg-white/5 hover:bg-red-600/10 text-white/40 hover:text-red-500 rounded-2xl font-black text-xs uppercase tracking-widest border border-white/10 hover:border-red-500/30 transition-all flex items-center gap-2"
                            >
                                <Trash2 size={16} />
                                Excluir Lead
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-950/20 transition-all active:scale-95 flex items-center gap-2"
                            >
                                {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
