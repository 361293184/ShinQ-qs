import React, { useState, useEffect, useCallback } from 'react';
import { generateImage as generateImageApi, loadUserImageSettings, saveUserImageSettings } from '../../utils/imageGen';

const CHAR_SETTINGS_PREFIX = 'os_imagegen_char_';
const STYLE_PRESETS = [
  { id: 'anime', label: '动漫', prompt: 'anime style, cel shading, vibrant colors' },
  { id: 'realistic', label: '写实', prompt: 'photorealistic, hyperdetailed, 8k, cinematic lighting' },
  { id: 'watercolor', label: '水彩', prompt: 'watercolor painting, soft edges, artistic' },
  { id: 'oil_painting', label: '油画', prompt: 'oil painting style, thick brushstrokes, classical' },
  { id: 'sketch', label: '素描', prompt: 'pencil sketch, monochrome, detailed linework' },
  { id: 'cyberpunk', label: '赛博朋克', prompt: 'cyberpunk, neon lights, futuristic city' },
  { id: 'fantasy', label: '奇幻', prompt: 'fantasy art, magical atmosphere, ethereal lighting' },
  { id: 'chibi', label: 'Q版', prompt: 'chibi style, cute, super deformed, adorable' },
];

type GenMode = 'char' | 'user' | 'joint';

const MODE_TABS: { id: GenMode; label: string }[] = [
  { id: 'char', label: '角色' },
  { id: 'user', label: '你' },
  { id: 'joint', label: '合照' },
];

interface ImageGenPanelProps {
  onClose: () => void;
  charName: string;
  charAvatar: string;
  charPersona?: string;
  chatContext: string;
  onGenerate: (url: string, caption: string) => void;
  imageGenApiKey: string;
  imageGenBaseUrl: string;
  imageGenModel: string;
  subBaseUrl?: string;
  subApiKey?: string;
  subModel?: string;
  /** 默认打开哪个 Tab（'char' | 'user' | 'joint'），默认 char */
  defaultMode?: GenMode;
  /** 哪些模式可用（用户/合照开关关掉时禁用） */
  availableModes?: GenMode[];
}

const ImageGenPanel: React.FC<ImageGenPanelProps> = ({
  onClose,
  charName,
  charAvatar,
  charPersona,
  chatContext,
  onGenerate,
  imageGenApiKey,
  imageGenBaseUrl,
  imageGenModel,
  subBaseUrl,
  subApiKey,
  subModel,
  defaultMode = 'char',
  availableModes = ['char', 'user', 'joint'],
}) => {
  const [mode, setMode] = useState<GenMode>(defaultMode);

  // ---- 角色侧状态 ----
  const [charDesc, setCharDesc] = useState('');
  const [charLockImage, setCharLockImage] = useState<string | null>(null);

  // ---- 用户侧状态 ----
  const [userDesc, setUserDesc] = useState('');
  const [userLockImage, setUserLockImage] = useState<string | null>(null);

  // ---- 通用状态 ----
  const [sceneDesc, setSceneDesc] = useState('');
  const [stylePreset, setStylePreset] = useState('anime');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');

  // ---- 加载角色已有设置 ----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAR_SETTINGS_PREFIX + charName);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.description) setCharDesc(d.description);
        if (d.lockImage) setCharLockImage(d.lockImage);
      }
    } catch {}
    if (!charDesc && charPersona) {
      const cleaned = charPersona.replace(/\s+/g, ' ').trim().slice(0, 600);
      setCharDesc(cleaned);
    }
  }, [charName, charPersona]);

  // ---- 加载用户锁脸/外观 ----
  useEffect(() => {
    const { description, lockImage } = loadUserImageSettings();
    if (description) setUserDesc(description);
    if (lockImage) setUserLockImage(lockImage);
  }, []);

  // ---- 保存角色设置 ----
  // desc / lock 可选：传入则用「传入的当前值」覆盖，避免 onChange 时闭包拿到旧 state。
  const saveCharSettings = useCallback((desc?: string, lock?: string | null) => {
    try {
      localStorage.setItem(CHAR_SETTINGS_PREFIX + charName, JSON.stringify({
        description: desc !== undefined ? desc : charDesc,
        lockImage: lock !== undefined ? lock : charLockImage,
        updatedAt: Date.now(),
      }));
    } catch {}
  }, [charName, charDesc, charLockImage]);

  // ---- 保存用户设置 ----
  const saveUserSettings = useCallback((desc?: string, lock?: string | null) => {
    saveUserImageSettings({
      description: desc !== undefined ? desc : userDesc,
      lockImage: lock !== undefined ? (lock || '') : (userLockImage || ''),
    });
  }, [userDesc, userLockImage]);

  // ---- 角色锁脸上传（上传成功立即自动保存，避免切 tab / 关面板丢失） ----
  const handleCharLockUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCharLockImage(dataUrl);
      // 上传即保存，关闭/切换后依然在
      try {
        localStorage.setItem(CHAR_SETTINGS_PREFIX + charName, JSON.stringify({
          description: charDesc,
          lockImage: dataUrl,
          updatedAt: Date.now(),
        }));
      } catch {}
    };
    reader.readAsDataURL(file);
  };

  // ---- 用户锁脸上传（上传成功立即自动保存） ----
  const handleUserLockUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUserLockImage(dataUrl);
      // 上传即保存
      saveUserImageSettings({ description: userDesc, lockImage: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  // ---- 拍照风格快捷填充场景 ----
  const quickScenePresets = [
    { label: '☕ 咖啡馆', text: '在温馨的咖啡馆里，阳光透过窗户洒在脸上' },
    { label: '🌸 樱花', text: '樱花树下，花瓣飘落，春日暖阳' },
    { label: '🌊 海边', text: '傍晚的海边，金色的夕阳，海浪轻轻拍打沙滩' },
    { label: '🏙️ 城市', text: '繁华的城市夜景，霓虹灯光映照' },
  ];

  // ---- 构造三种模式的 prompt（健壮版） ----
  const buildPrompt = (m: GenMode): { prompt: string; lockImage: string | null; caption: string } => {
    const style = STYLE_PRESETS.find(s => s.id === stylePreset);
    const styleText = style ? style.prompt : '';
    const scene = sceneDesc.trim();

    // 角色侧描述 fallback
    const charPart = charDesc.trim()
      || (charLockImage ? 'the character in the reference image (keep the face)' : 'a character');
    // 用户侧描述 fallback
    const userPart = userDesc.trim()
      || (userLockImage ? 'the person in the reference image (keep the face)' : 'a person');

    if (m === 'char') {
      const parts = [charPart];
      if (scene) parts.push(scene);
      parts.push(styleText);
      parts.push('masterpiece, best quality, highly detailed');
      return {
        prompt: parts.filter(Boolean).join(', '),
        lockImage: charLockImage,
        caption: `${charName} 的照片`,
      };
    }

    if (m === 'user') {
      const parts = [userPart];
      if (scene) parts.push(scene);
      parts.push(styleText);
      parts.push('masterpiece, best quality, highly detailed');
      return {
        prompt: parts.filter(Boolean).join(', '),
        lockImage: userLockImage,
        caption: '你的照片',
      };
    }

    // joint: 双人合照
    const parts = ['two people together in the photo'];
    parts.push(userPart);
    parts.push('and');
    parts.push(charPart);
    if (scene) parts.push(scene);
    parts.push('couple photo, intimate and natural pose');
    parts.push(styleText);
    parts.push('masterpiece, best quality, highly detailed');
    return {
      prompt: parts.filter(Boolean).join(', '),
      lockImage: charLockImage || userLockImage, // API 只传一张参考图
      caption: `和 ${charName} 的合照`,
    };
  };

  // ---- 生成图片 ----
  const handleGenerate = async () => {
    if (!imageGenBaseUrl || !imageGenApiKey || !imageGenModel) {
      setStatusText('请先在设置中配置生图 API');
      return;
    }

    // 基本校验：至少需要场景或一方描述
    if (mode === 'char' && !charDesc.trim() && !sceneDesc.trim()) {
      setStatusText('请填写角色外观或场景描述');
      return;
    }
    if (mode === 'user' && !userDesc.trim() && !sceneDesc.trim()) {
      setStatusText('请填写你的外观或场景描述');
      return;
    }
    if (mode === 'joint' && !charDesc.trim() && !userDesc.trim() && !sceneDesc.trim()) {
      setStatusText('请至少填写一方的外观或场景描述');
      return;
    }

    const { prompt: basePrompt, lockImage: finalLockImage, caption } = buildPrompt(mode);

    setIsGenerating(true);
    setStatusText('正在生成照片...');

    try {
      // sub API 优化 prompt（可选）
      let finalPrompt = basePrompt;
      if (subBaseUrl && subApiKey && subModel && chatContext) {
        try {
          const subBody = {
            model: subModel,
            messages: [
              { role: 'system', content: 'You are a prompt engineer. Generate a single detailed English image generation prompt based on the input. Describe scene, appearance, lighting, mood, composition. Output ONLY the prompt, nothing else.' },
              { role: 'user', content: `Mode: ${mode}\nCharacter: ${charName}\nCharDesc: ${charDesc}\nUserDesc: ${userDesc}\nScene: ${sceneDesc || 'portrait'}\nStyle: ${STYLE_PRESETS.find(s => s.id === stylePreset)?.prompt || ''}\nRecent chat context:\n${chatContext}` },
            ],
            max_tokens: 300,
            temperature: 0.7,
          };
          const res = await fetch(`${subBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${subApiKey}` },
            body: JSON.stringify(subBody),
          });
          if (res.ok) {
            const data = await res.json();
            const r = data?.choices?.[0]?.message?.content;
            if (r) finalPrompt = r.trim();
          }
        } catch {}
      }

      setStatusText('正在调用生图 API（可能需要 30-60 秒）...');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 300000);

      const result = await generateImageApi({
        baseUrl: imageGenBaseUrl,
        apiKey: imageGenApiKey,
        model: imageGenModel,
        prompt: finalPrompt,
        lockImageDataUrl: finalLockImage,
        signal: controller.signal,
        timeoutMs: 300000,
      });
      clearTimeout(timer);

      setStatusText('生成完成！');
      // 保存当前模式设置
      if (mode === 'char') saveCharSettings();
      else if (mode === 'user') saveUserSettings();
      else { saveCharSettings(); saveUserSettings(); }

      onGenerate(result.url, caption);
      onClose();
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? '请求超时（5 分钟）' : (e?.message || '未知错误');
      setStatusText(`失败: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ============ 渲染锁脸上传区域 ============
  const renderLockImageUploader = (
    image: string | null,
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void,
    onClear: () => void,
    label: string,
  ) => (
    <div className="flex items-center gap-3">
      <label className="w-16 h-16 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-rose-300 hover:bg-rose-50 transition-all flex-shrink-0 overflow-hidden">
        {image ? (
          <img src={image} alt="参考图" className="w-full h-full object-cover rounded-xl" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
        <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
      </label>
      <div className="flex flex-col gap-1 flex-1">
        <div className="text-xs text-slate-400 leading-relaxed">
          {image ? `已设置，生成时会尝试保持脸部特征` : `上传参考图，帮助 AI 保持脸部一致性`}
        </div>
        {image && (
          <button
            onClick={onClear}
            className="text-[10px] text-rose-400 hover:text-rose-500 font-bold text-left"
          >
            清除参考图
          </button>
        )}
      </div>
    </div>
  );

  // ============ 渲染描述输入框（onChange 即自动保存，不再依赖失焦/点保存） ============
  // onChange：更新 React state；onSave(v)：用「当前正在输入的新值 v」立即落盘，
  // 避免闭包拿到旧 state 导致"保存了但没存进去"。
  const renderDescTextarea = (
    value: string,
    onChange: (v: string) => void,
    onSave: (v: string) => void,
    placeholder: string,
  ) => (
    <textarea
      value={value}
      onChange={(e) => {
        const v = (e.target as HTMLTextAreaElement).value;
        onChange(v);
        onSave(v); // 输入即保存
      }}
      onBlur={(e) => onSave((e.target as HTMLTextAreaElement).value)}
      placeholder={placeholder}
      className="w-full h-20 rounded-xl p-3 text-sm bg-slate-50 border border-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300"
    />
  );

  // 模式是否可用（开关关闭时禁用）
  const isModeAvailable = (m: GenMode) => availableModes.includes(m);

  // 自动回退：如果当前模式不可用，切换到第一个可用的
  useEffect(() => {
    if (!isModeAvailable(mode) && isModeAvailable('char')) {
      setMode('char');
    }
  }, [availableModes, mode]);

  const generateButtonText = mode === 'char' ? '生成角色图片' : mode === 'user' ? '生成你的照片' : '生成合照';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ===== Header with Tabs ===== */}
      <div className="px-4 pt-3 pb-0 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-700">AI 生图</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Segmented Tabs */}
        <div className="flex bg-slate-100 rounded-xl p-0.5">
          {MODE_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => {
                if (!isModeAvailable(t.id)) {
                  setStatusText(`${t.label}模式开关未开启，请去 Settings 开启`);
                  setTimeout(() => setStatusText(''), 2000);
                  return;
                }
                setMode(t.id);
              }}
              className={`flex-1 py-2 rounded-[10px] text-xs font-bold transition-all active:scale-[0.97] relative ${
                mode === t.id
                  ? 'bg-white text-slate-700 shadow-sm'
                  : !isModeAvailable(t.id)
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-400 hover:text-slate-500'
              }`}
            >
              {t.label}
              {!isModeAvailable(t.id) && (
                <span className="absolute top-1 right-1 text-[8px]">🔒</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Content ===== */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* ---- 角色描述（char / joint 模式） ---- */}
        {(mode === 'char' || mode === 'joint') && (
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block">
              {charName} 的外观描述
            </label>
            {renderDescTextarea(charDesc, setCharDesc, (v) => saveCharSettings(v, undefined), `描述 ${charName} 的外貌特征...`)}
            <p className="text-[10px] text-slate-400 mt-1">输入后切换模式或点保存按钮保存</p>
          </div>
        )}

        {/* ---- 用户描述（user / joint 模式） ---- */}
        {(mode === 'user' || mode === 'joint') && (
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block">
              你的外观描述
            </label>
            {renderDescTextarea(userDesc, setUserDesc, (v) => saveUserSettings(v, undefined), '描述你的外貌特征...')}
            <p className="text-[10px] text-slate-400 mt-1">输入后切换模式或点保存按钮保存</p>
          </div>
        )}

        {/* ---- 场景描述（全部模式） ---- */}
        <div>
          <label className="text-xs font-bold text-slate-500 mb-1.5 block">场景描述</label>
          <input
            value={sceneDesc}
            onChange={(e) => setSceneDesc((e.target as HTMLInputElement).value)}
            placeholder="例如：在咖啡馆喝咖啡，阳光洒在脸上"
            className="w-full rounded-xl p-3 text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300"
          />
          {/* 快捷场景 */}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {quickScenePresets.map(s => (
              <button
                key={s.label}
                onClick={() => setSceneDesc(s.text)}
                className="text-[10px] px-2 py-1 rounded-lg bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- 风格预设（全部模式） ---- */}
        <div>
          <label className="text-xs font-bold text-slate-500 mb-1.5 block">风格预设</label>
          <div className="grid grid-cols-4 gap-2">
            {STYLE_PRESETS.map(s => (
              <button
                key={s.id}
                onClick={() => setStylePreset(s.id)}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  stylePreset === s.id
                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- 锁脸参考图 ---- */}
        {mode === 'char' && (
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block">
              {charName} 的锁脸参考图
            </label>
            {renderLockImageUploader(charLockImage, handleCharLockUpload, () => { setCharLockImage(null); saveCharSettings(undefined, null); }, charName)}
          </div>
        )}

        {mode === 'user' && (
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block">
              你的锁脸参考图
            </label>
            {renderLockImageUploader(userLockImage, handleUserLockUpload, () => { setUserLockImage(null); saveUserSettings(undefined, ''); }, '你')}
          </div>
        )}

        {mode === 'joint' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1.5 block">
                {charName} 的锁脸（生成时使用）
              </label>
              {renderLockImageUploader(charLockImage, handleCharLockUpload, () => { setCharLockImage(null); saveCharSettings(undefined, null); }, charName)}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1.5 block">
                你的锁脸（备选）
              </label>
              {renderLockImageUploader(userLockImage, handleUserLockUpload, () => { setUserLockImage(null); saveUserSettings(undefined, ''); }, '你')}
            </div>
          </div>
        )}
      </div>

      {/* ===== 保存按钮 ===== */}
      <div className="px-4 py-3 border-t border-slate-100">
        <button
          onClick={() => {
            if (mode === 'char') saveCharSettings();
            else if (mode === 'user') saveUserSettings();
            else { saveCharSettings(); saveUserSettings(); }
            setStatusText('✅ 设置已保存');
            setTimeout(() => setStatusText(''), 1500);
          }}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-400 to-green-500 text-white hover:from-emerald-500 hover:to-green-600 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 23l-9-2V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
          </svg>
          保存{mode === 'char' ? '角色' : mode === 'user' ? '你的' : '全部'}设置
        </button>
      </div>

      {/* ===== Footer / 生成按钮 ===== */}
      <div className="px-4 py-3 border-t border-slate-100 space-y-2">
        {statusText && (
          <div className={`text-xs text-center py-1.5 rounded-lg ${
            statusText.includes('失败') ? 'bg-red-50 text-red-500' :
            statusText.includes('完成') || statusText.includes('已') ? 'bg-green-50 text-green-600' :
            statusText.includes('未开启') ? 'bg-amber-50 text-amber-600' :
            'bg-rose-50 text-rose-600'
          }`}>
            {statusText}
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
            isGenerating
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-rose-400 to-pink-500 text-white hover:from-rose-500 hover:to-pink-600 shadow-md shadow-rose-200'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              生成中...
            </span>
          ) : generateButtonText}
        </button>
      </div>
    </div>
  );
};

export default ImageGenPanel;
