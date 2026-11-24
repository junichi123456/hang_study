import p1 from '../assets/banner/turn-p1.png';
import p2 from '../assets/banner/turn-p2.png';
import p3 from '../assets/banner/turn-p3.png';
import you from '../assets/banner/turn-you.png';
import blank from '../assets/banner/turn-blank.png';

/** 提供アセットをそのまま使用(加工なし)。1P=橙 / 2P=青 / 3P=緑 */
export const TURN_BANNERS = [p1, p2, p3] as const;
export const TURN_BANNER_YOU = you;
export const TURN_BANNER_BLANK = blank;
