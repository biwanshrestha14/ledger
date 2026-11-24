import {
  Briefcase, Car, CircleEllipsis, CircleHelp, CirclePlus, Clapperboard, Coffee, Dog, Dumbbell, Fuel, Gamepad2, Gift,
  GraduationCap, HandCoins, HeartPulse, Home, Laptop, type LucideIcon, Music, PiggyBank, Plane, Receipt, Repeat, Baby,
  Scissors, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Tag, TrendingUp, Utensils, Wifi, Wrench, Zap, Landmark, Bus, Book, Shield, Sparkles,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'shopping-basket': ShoppingBasket, utensils: Utensils, home: Home, car: Car, zap: Zap, 'shopping-bag': ShoppingBag,
  'heart-pulse': HeartPulse, clapperboard: Clapperboard, repeat: Repeat, plane: Plane, 'graduation-cap': GraduationCap,
  'circle-ellipsis': CircleEllipsis, briefcase: Briefcase, laptop: Laptop, 'trending-up': TrendingUp, gift: Gift,
  'circle-plus': CirclePlus, coffee: Coffee, fuel: Fuel, bus: Bus, wifi: Wifi, smartphone: Smartphone, shirt: Shirt,
  dumbbell: Dumbbell, music: Music, 'gamepad-2': Gamepad2, dog: Dog, baby: Baby, scissors: Scissors, wrench: Wrench,
  book: Book, shield: Shield, receipt: Receipt, landmark: Landmark, 'piggy-bank': PiggyBank, 'hand-coins': HandCoins,
  sparkles: Sparkles, tag: Tag, 'circle-help': CircleHelp,
};

export function CategoryIcon({ name, size = 18 }: { name?: string | null; size?: number }) {
  const I = (name && CATEGORY_ICONS[name]) || Tag;
  return <I size={size} strokeWidth={2} aria-hidden />;
}

export function Glyph({ icon, color, size = 'md' }: { icon?: string | null; color?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 15 : size === 'lg' ? 24 : 19;
  return (
    <span className={`glyph ${size === 'md' ? '' : size}`} style={{ background: color ?? 'var(--gray)' }}>
      <CategoryIcon name={icon} size={px} />
    </span>
  );
}

export const PALETTE = ['#0088ff', '#34c759', '#ff8d28', '#ff2d55', '#6155f5', '#00c3d0', '#cb30e0', '#ffcc00', '#ac7f5e', '#00c8b3', '#ff383c', '#8e8e93'];
