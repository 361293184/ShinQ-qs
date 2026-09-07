import React from 'react';
import roomArt from '../../assets/sar-club-room.png';
import './sar-club-room.css';

/** Original portrait artwork, with the existing activity entrances kept below it. */
const SARClubRoom: React.FC<{
    onOpenGacha: () => void;
    onOpenCabinet: () => void;
    onOpenModuleShop: () => void;
    onOpenFishingMarket: (entry: 'water' | 'board') => void;
}> = ({ onOpenGacha, onOpenCabinet, onOpenModuleShop, onOpenFishingMarket }) => (
    <div className="sar-club-room">
        <div className="sar-club-art">
            <img src={roomArt} alt="SAR 活动室原画" draggable={false} />
        </div>
        <nav className="sar-club-facilities" aria-label="活动室设施">
            <button type="button" aria-label="进入异世界扭蛋" onClick={onOpenGacha}>扭蛋</button>
            <button type="button" aria-label="进入异界陈列柜" onClick={onOpenCabinet}>陈列柜</button>
            <button type="button" aria-label="进入模块购买" onClick={onOpenModuleShop}>模块</button>
            <button type="button" aria-label="进入水域" onClick={() => onOpenFishingMarket('water')}>水域</button>
            <button type="button" aria-label="进入布告板" onClick={() => onOpenFishingMarket('board')}>布告板</button>
        </nav>
    </div>
);

export default SARClubRoom;
