import React from 'react';
import {MessageCircle, Instagram, MessageSquare, Music2} from 'lucide-react';
import {CHANNELS} from './chatChannels.mjs';

const ICONS = {whatsapp: MessageCircle, instagram: Instagram, messenger: MessageSquare, tiktok: Music2};

// Ícono genérico de cada red (no es el logotipo oficial), con color y nombre para que no dependa solo del color.
export default function ChannelIcon({channel, size = 16, withLabel = false}) {
  const Icon = ICONS[channel] || MessageCircle, meta = CHANNELS[channel] || {label: channel, color: '#57534e'};
  return <span className="ch-icon" style={{'--ch': meta.color}}><Icon size={size} aria-hidden="true"/>{withLabel && <span>{meta.label}</span>}</span>;
}
