/**
 * База моделей: карточки, вкладки (фото, ТЗ, лекала, табель мер, памятка)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConfigProvider,
  theme,
  Tabs,
  Upload,
  Table,
  Input,
  Button,
  Modal,
  message,
  Image,
  Space,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import ruRU from 'antd/locale/ru_RU';
import { api } from '../api';

const { TextArea } = Input;

function isMarkdownEmpty(src) {
  if (!src || !String(src).trim()) return true;
  const text = String(src)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return !text;
}

function TextEditor({ value, onChange, readOnly }) {
  const ref = useRef(null);
  const [activeBtn, setActiveBtn] = useState(null);

  const sNum = useRef(0);
  const ssNum = useRef(0);
  const mode = useRef(null);

  const applyHeading = (tag) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const selectedText = range.toString();

    if (!selectedText) return;
    if (!ref.current) return;

    const heading = document.createElement(tag);
    heading.textContent = selectedText;
    range.deleteContents();
    range.insertNode(heading);

    onChange(ref.current.innerHTML);
  };

  const exec = (cmd, val = null) => {
    if (!ref.current) return;
    ref.current.focus();
    document.execCommand(cmd, false, val);
    onChange(ref.current.innerHTML);
  };

  const btnStyle = (btnName) => ({
    background: activeBtn === btnName ? '#C8FF00' : '#333',
    color: activeBtn === btnName ? '#000' : '#fff',
    border: '1px solid #555',
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer',
    fontWeight: activeBtn === btnName ? 'bold' : 'normal',
  });

  const toggleMode = (newMode, insertFn) => {
    if (mode.current === newMode) {
      mode.current = null;
      setActiveBtn(null);
    } else {
      mode.current = newMode;
      setActiveBtn(newMode);
      insertFn();
    }
  };

  const insertItem = (modeType) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    let html = '';
    if (modeType === 'section') {
      sNum.current += 1;
      ssNum.current = 0;
      html =
        `<p style="margin-top:12px;margin-bottom:4px">` +
        `<strong>${sNum.current}. </strong></p>`;
    } else if (modeType === 'subsection') {
      ssNum.current += 1;
      html =
        `<p style="margin-top:8px;margin-bottom:4px;` +
        `padding-left:24px">` +
        `<strong>${sNum.current}.${ssNum.current} </strong></p>`;
    } else if (modeType === 'bullet') {
      html = `<p style="margin:3px 0;padding-left:24px">` + `● </p>`;
    } else if (modeType === 'subbullet') {
      html = `<p style="margin:3px 0;padding-left:48px">` + `○ </p>`;
    }

    const range = sel.getRangeAt(0);
    range.collapse(false);

    const el = document.createElement('div');
    el.innerHTML = html;
    const frag = document.createDocumentFragment();
    let lastNode = null;
    while (el.firstChild) {
      lastNode = el.firstChild;
      frag.appendChild(el.firstChild);
    }
    range.insertNode(frag);

    if (lastNode) {
      const newRange = document.createRange();
      newRange.setStartAfter(lastNode);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    onChange(ref.current.innerHTML);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (mode.current) {
        insertItem(mode.current);
      } else {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.collapse(false);
        const el = document.createElement('div');
        el.innerHTML = `<p style="margin:4px 0;text-indent:24px">&nbsp;</p>`;
        const frag = document.createDocumentFragment();
        let lastNode = null;
        while (el.firstChild) {
          lastNode = el.firstChild;
          frag.appendChild(el.firstChild);
        }
        range.insertNode(frag);
        if (lastNode) {
          const newRange = document.createRange();
          newRange.setStartAfter(lastNode);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
        onChange(ref.current.innerHTML);
      }
    }
    if (e.key === 'Escape') {
      mode.current = null;
      setActiveBtn(null);
    }
  };

  useEffect(() => {
    if (readOnly || !ref.current) return;
    const html = value || '';
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [value, readOnly]);

  const headingStyles = (
    <style>{`
      .models-base-text-editor-prose h1 {
        font-size: 24px;
        font-weight: bold;
        margin-top: 16px;
        margin-bottom: 8px;
      }
      .models-base-text-editor-prose h2 {
        font-size: 20px;
        font-weight: bold;
        margin-top: 16px;
        margin-bottom: 8px;
      }
      .models-base-text-editor-prose h3 {
        font-size: 16px;
        font-weight: bold;
        margin-top: 16px;
        margin-bottom: 8px;
      }
      .models-base-text-editor-prose p,
      .models-base-text-editor-prose li {
        margin-bottom: 6px;
      }
      .models-base-text-editor-prose ul,
      .models-base-text-editor-prose ol {
        padding-left: 24px;
      }
    `}</style>
  );

  if (readOnly) {
    return (
      <>
        {headingStyles}
        <div
          className="models-base-text-editor-prose"
          dangerouslySetInnerHTML={{ __html: value || '' }}
          style={{
            background: '#1a1a1a',
            color: '#fff',
            padding: 16,
            minHeight: 200,
            borderRadius: 6,
            border: '1px solid #333',
            lineHeight: 1.8,
            fontSize: 14,
          }}
        />
      </>
    );
  }

  return (
    <>
      {headingStyles}
      <div
        style={{
          border: '1px solid #444',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
      <div
        style={{
          background: '#2a2a2a',
          padding: '6px 10px',
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
          borderBottom: '1px solid #444',
        }}
      >
        <select
          defaultValue="3"
          onChange={(e) => exec('fontSize', e.target.value)}
          style={{
            background: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: 4,
            padding: '2px 6px',
          }}
        >
          <option value="2">12</option>
          <option value="3">14</option>
          <option value="4">16</option>
          <option value="5">18</option>
          <option value="6">24</option>
        </select>

        <button
          type="button"
          onClick={() => applyHeading('h1')}
          style={{
            background: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 16,
          }}
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => applyHeading('h2')}
          style={{
            background: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 14,
          }}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => applyHeading('h3')}
          style={{
            background: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 13,
          }}
        >
          H3
        </button>

        {[
          { cmd: 'bold', label: 'Ж', title: 'Жирный', style: { fontWeight: 'bold' } },
          { cmd: 'italic', label: 'К', title: 'Курсив', style: { fontStyle: 'italic' } },
          { cmd: 'underline', label: 'Ч', title: 'Подчёркнутый', style: { textDecoration: 'underline' } },
        ].map((btn) => (
          <button
            key={btn.cmd}
            type="button"
            onClick={() => exec(btn.cmd)}
            title={btn.title}
            style={{
              background: '#333',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: 4,
              padding: '2px 10px',
              cursor: 'pointer',
              ...btn.style,
            }}
          >
            {btn.label}
          </button>
        ))}

        <input
          type="color"
          title="Цвет текста"
          onChange={(e) => exec('foreColor', e.target.value)}
          style={{
            width: 32,
            height: 28,
            background: '#333',
            border: '1px solid #555',
            borderRadius: 4,
            cursor: 'pointer',
            padding: 2,
          }}
        />

        <input
          type="color"
          title="Выделить цветом"
          onChange={(e) => exec('hiliteColor', e.target.value)}
          style={{
            width: 32,
            height: 28,
            background: '#ff0',
            border: '1px solid #555',
            borderRadius: 4,
            cursor: 'pointer',
            padding: 2,
          }}
        />

        <span style={{ borderLeft: '1px solid #555', margin: '0 4px' }} />

        {[
          { cmd: 'justifyLeft', label: '≡←', title: 'По левому' },
          { cmd: 'justifyCenter', label: '≡', title: 'По центру' },
          { cmd: 'justifyRight', label: '≡→', title: 'По правому' },
          { cmd: 'justifyFull', label: '≡≡', title: 'По ширине' },
        ].map((btn) => (
          <button
            key={btn.cmd}
            type="button"
            onClick={() => exec(btn.cmd)}
            title={btn.title}
            style={{
              background: '#333',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            {btn.label}
          </button>
        ))}

        <span style={{ borderLeft: '1px solid #555', margin: '0 4px' }} />

        <button
          type="button"
          onClick={() => {
            toggleMode('section', () => insertItem('section'));
          }}
          title="Раздел (1. 2. 3.)"
          style={btnStyle('section')}
        >
          1.
        </button>

        <button
          type="button"
          onClick={() => {
            toggleMode('subsection', () => insertItem('subsection'));
          }}
          title="Подраздел (1.1 1.2…)"
          style={btnStyle('subsection')}
        >
          1.1
        </button>

        <button
          type="button"
          onClick={() => {
            toggleMode('bullet', () => insertItem('bullet'));
          }}
          title="Пункт первого уровня"
          style={btnStyle('bullet')}
        >
          ●
        </button>

        <button
          type="button"
          onClick={() => {
            toggleMode('subbullet', () => insertItem('subbullet'));
          }}
          title="Подпункт второго уровня"
          style={btnStyle('subbullet')}
        >
          ○
        </button>

        <span style={{ borderLeft: '1px solid #555', margin: '0 4px' }} />

        {[
          { cmd: 'outdent', label: '←', title: 'Уменьшить отступ' },
          { cmd: 'indent', label: '→', title: 'Увеличить отступ' },
        ].map((btn) => (
          <button
            key={btn.cmd}
            type="button"
            onClick={() => exec(btn.cmd)}
            title={btn.title}
            style={{
              background: '#333',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div
        ref={ref}
        className="models-base-text-editor-prose"
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onInput={() => onChange(ref.current.innerHTML)}
        style={{
          background: '#1a1a1a',
          color: '#fff',
          padding: 16,
          minHeight: 400,
          fontSize: 14,
          lineHeight: 1.8,
          letterSpacing: '0.01em',
          wordSpacing: '0.05em',
          outline: 'none',
        }}
      />
    </div>
    </>
  );
}

const DEFAULT_TABEL_MER = {
  sizes: ['42', '44', '46', '48', '50', '52'],
  rows: [
    { id: 'r-len', label: 'Длина изделия', values: {} },
    { id: 'r-sh', label: 'Ширина плеч', values: {} },
    { id: 'r-ch', label: 'Обхват груди', values: {} },
  ],
};

const DEFAULT_PAMYATKA = {
  rows: [
    { id: 'pm-0', razdel: '', kak_dolzhno: '', ne_dopuskaetsya: '' },
    { id: 'pm-1', razdel: '', kak_dolzhno: '', ne_dopuskaetsya: '' },
    { id: 'pm-2', razdel: '', kak_dolzhno: '', ne_dopuskaetsya: '' },
  ],
  photos: [],
};

function normalizeDraftPamyatka(raw) {
  if (raw == null || raw === '') {
    return {
      rows: DEFAULT_PAMYATKA.rows.map((r) => ({ ...r })),
      photos: [],
    };
  }
  if (typeof raw === 'object' && raw !== null && Array.isArray(raw.rows)) {
    return {
      rows: raw.rows.map((r, i) => ({
        id: r.id != null ? String(r.id) : `pm-${i}`,
        razdel: r.razdel != null ? String(r.razdel) : '',
        kak_dolzhno: r.kak_dolzhno != null ? String(r.kak_dolzhno) : '',
        ne_dopuskaetsya: r.ne_dopuskaetsya != null ? String(r.ne_dopuskaetsya) : '',
      })),
      photos: Array.isArray(raw.photos) ? [...raw.photos] : [],
    };
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{')) {
      try {
        return normalizeDraftPamyatka(JSON.parse(t));
      } catch {
        return {
          rows: DEFAULT_PAMYATKA.rows.map((r) => ({ ...r })),
          photos: [],
        };
      }
    }
    return {
      rows: [
        { id: 'pm-0', razdel: '', kak_dolzhno: t, ne_dopuskaetsya: '' },
        ...DEFAULT_PAMYATKA.rows.slice(1).map((r, i) => ({ ...r, id: `pm-${i + 1}` })),
      ],
      photos: [],
    };
  }
  return {
    rows: DEFAULT_PAMYATKA.rows.map((r) => ({ ...r })),
    photos: [],
  };
}

function isPamyatkaEmpty(p) {
  const x = normalizeDraftPamyatka(p);
  const rowsEmpty = x.rows.every(
    (r) =>
      !String(r.razdel || '').trim() &&
      !String(r.kak_dolzhno || '').trim() &&
      !String(r.ne_dopuskaetsya || '').trim()
  );
  const noPhotos = !Array.isArray(x.photos) || x.photos.length === 0;
  return rowsEmpty && noPhotos;
}

function normalizeDraft(row) {
  if (!row) return null;
  const tm = row.tabel_mer && typeof row.tabel_mer === 'object' ? row.tabel_mer : {};
  const sizes = Array.isArray(tm.sizes) && tm.sizes.length ? tm.sizes.map(String) : [...DEFAULT_TABEL_MER.sizes];
  const rows = Array.isArray(tm.rows) && tm.rows.length
    ? tm.rows.map((r, i) => ({
        id: r.id || `row-${i}`,
        label: r.label != null ? String(r.label) : '',
        values: r.values && typeof r.values === 'object' ? { ...r.values } : {},
      }))
    : DEFAULT_TABEL_MER.rows.map((r) => ({ ...r, values: { ...r.values } }));
  return {
    ...row,
    photos: Array.isArray(row.photos) ? [...row.photos] : [],
    lekala: Array.isArray(row.lekala) ? [...row.lekala] : [],
    tabel_mer: { sizes, rows },
    konfek_logo: row.konfek_logo != null ? String(row.konfek_logo) : '',
    konfek_model: row.konfek_model != null ? String(row.konfek_model) : '',
    konfek_name: row.konfek_name != null ? String(row.konfek_name) : '',
    konfek_sizes: row.konfek_sizes != null ? String(row.konfek_sizes) : '',
    konfek_collection: row.konfek_collection != null ? String(row.konfek_collection) : '',
    konfek_fabric: row.konfek_fabric != null ? String(row.konfek_fabric) : '',
    konfek_fittings: row.konfek_fittings != null ? String(row.konfek_fittings) : '',
    konfek_note: row.konfek_note != null ? String(row.konfek_note) : '',
    pamyatka: normalizeDraftPamyatka(row.pamyatka),
  };
}

export default function ModelsBase() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editing, setEditing] = useState(null);
  /** Режим карточки: просмотр (только чтение) или редактирование */
  const [detailMode, setDetailMode] = useState('edit');
  const [saving, setSaving] = useState(false);

  const readOnly = Boolean(editing) && detailMode === 'view';

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.modelsBase.list(
        debouncedSearch ? { search: debouncedSearch } : {}
      );
      setList(Array.isArray(rows) ? rows : []);
    } catch (e) {
      message.error(e?.message || 'Ошибка загрузки');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (editing) return;
    loadList();
  }, [loadList, editing]);

  const openCreate = async () => {
    try {
      const row = await api.modelsBase.create({
        code: '',
        name: 'Новая модель',
        description: '',
        technical_desc: '',
        pamyatka: {
          rows: DEFAULT_PAMYATKA.rows.map((r) => ({ ...r })),
          photos: [],
        },
        photos: [],
        lekala: [],
        tabel_mer: DEFAULT_TABEL_MER,
        konfek_logo: '',
        konfek_model: '',
        konfek_name: '',
        konfek_sizes: '',
        konfek_collection: '',
        konfek_fabric: '',
        konfek_fittings: '',
        konfek_note: '',
      });
      setEditing(normalizeDraft(row));
      setDetailMode('edit');
    } catch (e) {
      message.error(e?.message || 'Не удалось создать');
    }
  };

  const openDetail = async (item, mode) => {
    try {
      const row = await api.modelsBase.get(item.id);
      setEditing(normalizeDraft(row));
      setDetailMode(mode === 'edit' ? 'edit' : 'view');
    } catch (e) {
      message.error(e?.message || 'Ошибка загрузки карточки');
    }
  };

  const cancelEdit = async () => {
    if (!editing?.id) return;
    try {
      const row = await api.modelsBase.get(editing.id);
      setEditing(normalizeDraft(row));
      setDetailMode('view');
    } catch (e) {
      message.error(e?.message || 'Не удалось отменить изменения');
    }
  };

  const saveDraft = async () => {
    if (!editing?.id) return;
    setSaving(true);
    try {
      const payload = {
        code: editing.code,
        name: editing.name,
        description: editing.description,
        technical_desc: editing.technical_desc,
        pamyatka: editing.pamyatka,
        photos: editing.photos,
        lekala: editing.lekala,
        tabel_mer: editing.tabel_mer,
        konfek_logo: editing.konfek_logo,
        konfek_model: editing.konfek_model,
        konfek_name: editing.konfek_name,
        konfek_sizes: editing.konfek_sizes,
        konfek_collection: editing.konfek_collection,
        konfek_fabric: editing.konfek_fabric,
        konfek_fittings: editing.konfek_fittings,
        konfek_note: editing.konfek_note,
      };
      const updated = await api.modelsBase.update(editing.id, payload);
      message.success('Сохранено');
      setEditing(normalizeDraft(updated));
      setDetailMode('view');
      loadList();
    } catch (e) {
      message.error(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item) => {
    Modal.confirm({
      title: 'Удалить модель?',
      content: `${item.name || 'Без названия'} (${item.code || '—'})`,
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await api.modelsBase.delete(item.id);
          message.success('Удалено');
          if (editing?.id === item.id) {
            setEditing(null);
            setDetailMode('edit');
          }
          loadList();
        } catch (e) {
          message.error(e?.message || 'Ошибка удаления');
        }
      },
    });
  };

  const updateField = (key, value) => {
    setEditing((d) => (d ? { ...d, [key]: value } : d));
  };

  const updateTabelRowLabel = (index, label) => {
    setEditing((d) => {
      if (!d?.tabel_mer?.rows) return d;
      const rows = d.tabel_mer.rows.map((r, i) => (i === index ? { ...r, label } : r));
      return { ...d, tabel_mer: { ...d.tabel_mer, rows } };
    });
  };

  const updateTabelCell = (rowIndex, sizeKey, value) => {
    setEditing((d) => {
      if (!d?.tabel_mer?.rows) return d;
      const rows = d.tabel_mer.rows.map((r, i) => {
        if (i !== rowIndex) return r;
        return { ...r, values: { ...r.values, [sizeKey]: value } };
      });
      return { ...d, tabel_mer: { ...d.tabel_mer, rows } };
    });
  };

  const addTabelRow = () => {
    setEditing((d) => {
      if (!d?.tabel_mer) return d;
      const id = `row-${Date.now()}`;
      const rows = [...d.tabel_mer.rows, { id, label: '', values: {} }];
      return { ...d, tabel_mer: { ...d.tabel_mer, rows } };
    });
  };

  const removeTabelRow = (index) => {
    setEditing((d) => {
      if (!d?.tabel_mer?.rows) return d;
      const rows = d.tabel_mer.rows.filter((_, i) => i !== index);
      return { ...d, tabel_mer: { ...d.tabel_mer, rows } };
    });
  };

  const appendDataUrl = (field, file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result;
        if (typeof url === 'string') {
          setEditing((d) => {
            if (!d) return d;
            const arr = Array.isArray(d[field]) ? [...d[field]] : [];
            arr.push(url);
            return { ...d, [field]: arr };
          });
          resolve();
        } else reject(new Error('read'));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const removeAsset = (field, index) => {
    setEditing((d) => {
      if (!d) return d;
      const arr = Array.isArray(d[field]) ? d[field].filter((_, i) => i !== index) : [];
      return { ...d, [field]: arr };
    });
  };

  const updatePamyatkaCell = (index, fieldKey, value) => {
    setEditing((d) => {
      if (!d?.pamyatka?.rows) return d;
      const rows = d.pamyatka.rows.map((r, i) =>
        i === index ? { ...r, [fieldKey]: value } : r,
      );
      return { ...d, pamyatka: { ...d.pamyatka, rows } };
    });
  };

  const addPamyatkaRow = () => {
    setEditing((d) => {
      if (!d) return d;
      const p = normalizeDraftPamyatka(d.pamyatka);
      const id = `pm-${Date.now()}`;
      return {
        ...d,
        pamyatka: {
          ...p,
          rows: [...p.rows, { id, razdel: '', kak_dolzhno: '', ne_dopuskaetsya: '' }],
        },
      };
    });
  };

  const removePamyatkaRow = (index) => {
    setEditing((d) => {
      if (!d?.pamyatka?.rows) return d;
      const rows = d.pamyatka.rows.filter((_, i) => i !== index);
      return { ...d, pamyatka: { ...d.pamyatka, rows } };
    });
  };

  const appendPamyatkaPhoto = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result;
        if (typeof url === 'string') {
          setEditing((d) => {
            if (!d) return d;
            const p = normalizeDraftPamyatka(d.pamyatka);
            return { ...d, pamyatka: { ...p, photos: [...p.photos, url] } };
          });
          resolve();
        } else reject(new Error('read'));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const removePamyatkaPhoto = (index) => {
    setEditing((d) => {
      if (!d?.pamyatka?.photos) return d;
      const photos = d.pamyatka.photos.filter((_, i) => i !== index);
      return { ...d, pamyatka: { ...d.pamyatka, photos } };
    });
  };

  let tabelColumns = [];
  if (editing?.tabel_mer) {
    const sizes = editing.tabel_mer.sizes || DEFAULT_TABEL_MER.sizes;
    tabelColumns = [
      {
        title: 'Параметр',
        key: 'label',
        width: 200,
        render: (_, record, index) => (
          <Input
            readOnly={readOnly}
            value={record.label}
            onChange={(e) => updateTabelRowLabel(index, e.target.value)}
            placeholder="Название"
          />
        ),
      },
      ...sizes.map((s) => ({
        title: s,
        key: s,
        width: 90,
        render: (_, record, index) => (
          <Input
            readOnly={readOnly}
            value={record.values?.[s] ?? ''}
            onChange={(e) => updateTabelCell(index, s, e.target.value)}
            placeholder="—"
          />
        ),
      })),
    ];
    if (!readOnly) {
      tabelColumns.push({
        title: '',
        key: 'del',
        width: 56,
        render: (_, __, index) => (
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeTabelRow(index)} />
        ),
      });
    }
  }

  const tabItems = editing
    ? [
        {
          key: 'photos',
          label: 'Фото',
          children: (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {(editing.photos || []).map((url, i) => (
                  <div key={i} className="relative inline-block">
                    <Image src={url} width={120} height={120} className="object-cover rounded border border-white/10" />
                    {!readOnly && (
                      <Button
                        type="text"
                        danger
                        size="small"
                        className="!absolute -top-1 -right-1"
                        onClick={() => removeAsset('photos', i)}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void appendDataUrl('photos', file).catch(() => message.error('Не удалось прочитать файл'));
                    return false;
                  }}
                >
                  <Button icon={<PlusOutlined />}>Добавить фото</Button>
                </Upload>
              )}
            </div>
          ),
        },
        {
          key: 'konfek',
          label: 'Конфекционная карта',
          children: (
            <div className="space-y-4">
              <style>{`
                @media print {
                  @page { margin: 14mm; }
                  body * { visibility: hidden !important; }
                  #konfek-print-card,
                  #konfek-print-card * {
                    visibility: visible !important;
                  }
                  #konfek-print-card {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    min-height: 100% !important;
                    margin: 0 !important;
                    padding: 24px !important;
                    background: #fff !important;
                    color: #000 !important;
                    box-shadow: none !important;
                    border: none !important;
                  }
                  #konfek-print-card .konfek-print-title {
                    color: #000 !important;
                  }
                  #konfek-print-card table.konfek-table {
                    width: 100%;
                    border-collapse: collapse;
                  }
                  #konfek-print-card table.konfek-table td {
                    border: 1px solid #222 !important;
                    padding: 8px 12px !important;
                    color: #000 !important;
                    background: #fff !important;
                  }
                  #konfek-print-card input,
                  #konfek-print-card textarea,
                  #konfek-print-card .ant-input,
                  #konfek-print-card .ant-input-css-var {
                    color: #000 !important;
                    background: #fff !important;
                    -webkit-text-fill-color: #000 !important;
                  }
                  #konfek-print-card .konfek-print-logo-wrap img {
                    max-height: 72px !important;
                  }
                  .konfek-no-print {
                    display: none !important;
                  }
                }
              `}</style>

              <div className="konfek-no-print flex flex-wrap gap-2 items-center">
                {!readOnly && (
                  <>
                    <Upload
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        void new Promise((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const url = reader.result;
                            if (typeof url === 'string') {
                              updateField('konfek_logo', url);
                              resolve();
                            } else reject(new Error('read'));
                          };
                          reader.onerror = reject;
                          reader.readAsDataURL(file);
                        }).catch(() => message.error('Не удалось прочитать файл'));
                        return false;
                      }}
                    >
                      <Button icon={<PlusOutlined />}>Логотип (загрузить)</Button>
                    </Upload>
                    {editing.konfek_logo ? (
                      <Button type="text" danger onClick={() => updateField('konfek_logo', '')}>
                        Удалить лого
                      </Button>
                    ) : null}
                  </>
                )}
                <Button icon={<PrinterOutlined />} type="primary" onClick={() => window.print()}>
                  🖨 Распечатать карту
                </Button>
              </div>

              <div
                id="konfek-print-card"
                className="rounded-lg border border-white/15 bg-[#141518] p-4 md:p-6 max-w-3xl text-[#edeef0]"
              >
                <div className="konfek-print-logo-wrap flex flex-col items-center gap-2 mb-4">
                  {editing.konfek_logo ? (
                    <img
                      src={editing.konfek_logo}
                      alt="ERDEN"
                      className="max-h-[72px] object-contain"
                    />
                  ) : (
                    <div className="text-lg font-semibold tracking-wide text-white/90">ERDEN</div>
                  )}
                  <h2 className="konfek-print-title text-center text-base font-semibold m-0 text-white">
                    Конфекционная карта
                  </h2>
                </div>

                <table className="konfek-table w-full border-collapse text-sm">
                  <tbody>
                    <tr className="border-b border-white/10">
                      <td className="py-2 pr-3 align-top w-[40%] text-white/80 border border-white/15">
                        Модель / заказ:
                      </td>
                      <td className="py-2 align-top border border-white/15">
                        <Input
                          readOnly={readOnly}
                          variant="borderless"
                          className="text-white !bg-transparent"
                          value={editing.konfek_model || ''}
                          onChange={(e) => updateField('konfek_model', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="py-2 pr-3 align-top text-white/80 border border-white/15">
                        Наименование:
                      </td>
                      <td className="py-2 align-top border border-white/15">
                        <Input
                          readOnly={readOnly}
                          variant="borderless"
                          className="text-white !bg-transparent"
                          value={editing.konfek_name || ''}
                          onChange={(e) => updateField('konfek_name', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="py-2 pr-3 align-top text-white/80 border border-white/15">
                        Размеры / кол:
                      </td>
                      <td className="py-2 align-top border border-white/15">
                        <Input
                          readOnly={readOnly}
                          variant="borderless"
                          className="text-white !bg-transparent"
                          value={editing.konfek_sizes || ''}
                          onChange={(e) => updateField('konfek_sizes', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="py-2 pr-3 align-top text-white/80 border border-white/15">
                        Коллекция / стиль:
                      </td>
                      <td className="py-2 align-top border border-white/15">
                        <Input
                          readOnly={readOnly}
                          variant="borderless"
                          className="text-white !bg-transparent"
                          value={editing.konfek_collection || ''}
                          onChange={(e) => updateField('konfek_collection', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="py-2 pr-3 align-top text-white/80 border border-white/15">
                        Состав ткани:
                      </td>
                      <td className="py-2 align-top border border-white/15">
                        <Input
                          readOnly={readOnly}
                          variant="borderless"
                          className="text-white !bg-transparent"
                          value={editing.konfek_fabric || ''}
                          onChange={(e) => updateField('konfek_fabric', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="py-2 pr-3 align-top text-white/80 border border-white/15">
                        Фурнитура:
                      </td>
                      <td className="py-2 align-top border border-white/15">
                        <Input
                          readOnly={readOnly}
                          variant="borderless"
                          className="text-white !bg-transparent"
                          value={editing.konfek_fittings || ''}
                          onChange={(e) => updateField('konfek_fittings', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 align-top text-white/80 border border-white/15">
                        Примечание:
                      </td>
                      <td className="py-2 align-top border border-white/15">
                        <TextArea
                          readOnly={readOnly}
                          variant="borderless"
                          className="text-white !bg-transparent"
                          rows={4}
                          value={editing.konfek_note || ''}
                          onChange={(e) => updateField('konfek_note', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          key: 'tech',
          label: 'Техническое описание',
          children: readOnly ? (
            isMarkdownEmpty(editing.technical_desc) ? (
              <p className="text-white/40 py-4">Нет технического описания.</p>
            ) : (
              <TextEditor value={editing.technical_desc} readOnly />
            )
          ) : (
            <TextEditor
              value={editing.technical_desc}
              onChange={(v) => updateField('technical_desc', v)}
            />
          ),
        },
        {
          key: 'lekala',
          label: 'Лекала',
          children: (
            <div className="space-y-4">
              <p className="text-sm text-white/60">Фото или сканы лекал (несколько файлов).</p>
              <div className="flex flex-wrap gap-3">
                {(editing.lekala || []).map((url, i) => (
                  <div key={i} className="relative inline-block">
                    {String(url).startsWith('data:image') ? (
                      <Image src={url} width={120} height={120} className="object-cover rounded border border-white/10" />
                    ) : (
                      <a href={url} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                        Файл {i + 1}
                      </a>
                    )}
                    {!readOnly && (
                      <Button type="text" danger size="small" className="!ml-2" onClick={() => removeAsset('lekala', i)}>
                        Удалить
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <Upload
                  accept="image/*,.pdf,.dxf"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void appendDataUrl('lekala', file).catch(() => message.error('Не удалось прочитать файл'));
                    return false;
                  }}
                >
                  <Button icon={<PlusOutlined />}>Добавить файл</Button>
                </Upload>
              )}
            </div>
          ),
        },
        {
          key: 'tabel',
          label: 'Табель мер',
          children: (
            <div className="space-y-3">
              {!readOnly && (
                <Button type="dashed" onClick={addTabelRow} icon={<PlusOutlined />}>
                  Добавить строку
                </Button>
              )}
              <div className="overflow-x-auto">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  columns={tabelColumns}
                  dataSource={editing.tabel_mer?.rows || []}
                  scroll={{ x: true }}
                />
              </div>
            </div>
          ),
        },
        {
          key: 'pamyatka',
          label: 'Памятка',
          children: (
            <div className="space-y-5">
              {readOnly && isPamyatkaEmpty(editing.pamyatka) ? (
                <p className="text-white/40 py-4">Таблица контроля качества не заполнена.</p>
              ) : (
                <>
                  {!readOnly && (
                    <Button type="dashed" onClick={addPamyatkaRow} icon={<PlusOutlined />}>
                      Добавить строку
                    </Button>
                  )}
                  <div className="overflow-x-auto rounded border border-[#333]">
                    <table className="w-full border-collapse text-sm" style={{ borderColor: '#333' }}>
                      <thead>
                        <tr style={{ background: '#2a2a2a' }}>
                          <th
                            className="text-left font-medium px-3 py-2 border border-[#333]"
                            style={{ color: '#fff', borderColor: '#333' }}
                          >
                            Раздел
                          </th>
                          <th
                            className="text-left font-medium px-3 py-2 border border-[#333]"
                            style={{
                              background: '#1a3a1a',
                              color: '#4caf50',
                              fontWeight: 'bold',
                              borderColor: '#333',
                            }}
                          >
                            Как должно быть
                          </th>
                          <th
                            className="text-left font-medium px-3 py-2 border border-[#333]"
                            style={{
                              background: '#3a1a1a',
                              color: '#f44336',
                              fontWeight: 'bold',
                              borderColor: '#333',
                            }}
                          >
                            Не допускается
                          </th>
                          {!readOnly ? (
                            <th
                              className="text-center font-medium px-2 py-2 border border-[#333] w-14"
                              style={{ color: '#fff', borderColor: '#333' }}
                            >
                              {' '}
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {(normalizeDraftPamyatka(editing.pamyatka).rows || []).map((row, index) => (
                          <tr key={row.id || index} style={{ background: '#1a1a1a' }}>
                            <td className="p-2 align-top border border-[#333]" style={{ borderColor: '#333' }}>
                              <Input
                                readOnly={readOnly}
                                value={row.razdel}
                                onChange={(e) => updatePamyatkaCell(index, 'razdel', e.target.value)}
                                placeholder="—"
                                style={{
                                  background: '#111',
                                  color: '#fff',
                                  border: '1px solid #333',
                                }}
                              />
                            </td>
                            <td className="p-2 align-top border border-[#333]" style={{ borderColor: '#333' }}>
                              <TextArea
                                readOnly={readOnly}
                                value={row.kak_dolzhno}
                                onChange={(e) => updatePamyatkaCell(index, 'kak_dolzhno', e.target.value)}
                                placeholder="—"
                                autoSize={{ minRows: 2 }}
                                style={{
                                  minHeight: 60,
                                  background: '#0d2a0d',
                                  color: '#81c784',
                                  border: '1px solid #2e7d32',
                                }}
                              />
                            </td>
                            <td className="p-2 align-top border border-[#333]" style={{ borderColor: '#333' }}>
                              <TextArea
                                readOnly={readOnly}
                                value={row.ne_dopuskaetsya}
                                onChange={(e) =>
                                  updatePamyatkaCell(index, 'ne_dopuskaetsya', e.target.value)
                                }
                                placeholder="—"
                                autoSize={{ minRows: 2 }}
                                style={{
                                  minHeight: 60,
                                  background: '#2a0d0d',
                                  color: '#e57373',
                                  border: '1px solid #c62828',
                                }}
                              />
                            </td>
                            {!readOnly ? (
                              <td className="p-2 align-middle border border-[#333] text-center" style={{ borderColor: '#333' }}>
                                <Button
                                  type="text"
                                  danger
                                  title="Удалить строку"
                                  onClick={() => removePamyatkaRow(index)}
                                >
                                  🗑
                                </Button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-white/90">Фото памятки</div>
                    <div className="flex flex-wrap gap-3">
                      {(normalizeDraftPamyatka(editing.pamyatka).photos || []).map((url, i) => (
                        <div key={i} className="relative inline-block">
                          <Image
                            src={url}
                            width={120}
                            height={120}
                            className="object-cover rounded border border-[#333]"
                          />
                          {!readOnly && (
                            <Button
                              type="text"
                              danger
                              size="small"
                              className="!absolute -top-1 -right-1"
                              onClick={() => removePamyatkaPhoto(i)}
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    {!readOnly && (
                      <Upload
                        accept="image/*"
                        showUploadList={false}
                        beforeUpload={(file) => {
                          void appendPamyatkaPhoto(file).catch(() =>
                            message.error('Не удалось прочитать файл'),
                          );
                          return false;
                        }}
                      >
                        <Button icon={<PlusOutlined />}>Добавить фото</Button>
                      </Upload>
                    )}
                  </div>
                </>
              )}
            </div>
          ),
        },
      ]
    : [];

  const antdTheme = {
    algorithm: theme.darkAlgorithm,
    token: {
      colorBgContainer: '#101114',
      colorBgElevated: '#14161a',
      colorBorder: 'rgba(255, 255, 255, 0.08)',
      colorText: '#edeef0',
      colorTextSecondary: '#a7adb6',
    },
  };

  if (editing) {
    return (
      <ConfigProvider locale={ruRU} theme={antdTheme}>
        <div className="min-h-[calc(100vh-56px)] p-4 md:p-6 max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Button icon={<ArrowLeftOutlined />} onClick={() => setEditing(null)}>
              ← К списку
            </Button>
            <Space className="flex-1 flex-wrap min-w-0">
              <Input
                readOnly={readOnly}
                className="max-w-[140px]"
                placeholder="Код"
                value={editing.code}
                onChange={(e) => updateField('code', e.target.value)}
              />
              <Input
                readOnly={readOnly}
                className="max-w-md flex-1 min-w-[200px]"
                placeholder="Название"
                value={editing.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </Space>
            <Space wrap className="ml-auto">
              {readOnly ? (
                <Button type="primary" onClick={() => setDetailMode('edit')}>
                  ✏️ Редактировать
                </Button>
              ) : (
                <>
                  <Button onClick={cancelEdit}>Отмена</Button>
                  <Button type="primary" loading={saving} onClick={saveDraft}>
                    💾 Сохранить
                  </Button>
                </>
              )}
            </Space>
          </div>
          <TextArea
            readOnly={readOnly}
            className="mb-4"
            rows={2}
            placeholder="Краткое описание (для списка)"
            value={editing.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
          />
          <Tabs items={tabItems} destroyInactiveTabPane={false} />
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={ruRU} theme={antdTheme}>
      <div className="min-h-[calc(100vh-56px)] p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <h1 className="text-xl font-semibold text-[var(--text)]">База моделей</h1>
          <Input
            allowClear
            placeholder="Поиск по коду или названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} className="sm:ml-auto">
            + Добавить модель
          </Button>
        </div>

        {loading ? (
          <p className="text-[var(--muted)]">Загрузка…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((item) => {
              const thumb = Array.isArray(item.photos) && item.photos[0] ? item.photos[0] : null;
              return (
                <div
                  key={item.id}
                  className="card-neon rounded-xl p-4 flex gap-4 border border-white/[0.06] bg-[var(--surface)] hover:border-[var(--accent)]/30 transition-colors"
                >
                  <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-black/30 border border-white/10">
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl text-white/20">📦</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="text-sm text-[var(--muted)] font-mono truncate">{item.code || '—'}</div>
                    <div className="font-medium text-[var(--text)] truncate">{item.name || 'Без названия'}</div>
                    {item.description ? (
                      <div className="text-xs text-[var(--muted)] line-clamp-2 mt-1">{item.description}</div>
                    ) : null}
                    <div className="mt-auto pt-3 flex flex-wrap gap-2">
                      <Button size="small" onClick={() => openDetail(item, 'view')}>
                        👁 Просмотр
                      </Button>
                      <Button size="small" type="primary" onClick={() => openDetail(item, 'edit')}>
                        ✏️ Изменить
                      </Button>
                      <Button size="small" danger onClick={() => confirmDelete(item)}>
                        🗑 Удалить
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && list.length === 0 && (
          <p className="text-[var(--muted)] mt-8 text-center">Моделей пока нет. Нажмите «Добавить модель».</p>
        )}
      </div>
    </ConfigProvider>
  );
}
