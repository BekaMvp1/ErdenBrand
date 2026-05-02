/**
 * База моделей: карточки, вкладки (фото, ТЗ, лекала, табель мер, памятка)
 */

import { useCallback, useEffect, useState } from 'react';
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
import { PlusOutlined, DeleteOutlined, SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import ruRU from 'antd/locale/ru_RU';
import { api } from '../api';

const { TextArea } = Input;

const DEFAULT_TABEL_MER = {
  sizes: ['42', '44', '46', '48', '50', '52'],
  rows: [
    { id: 'r-len', label: 'Длина изделия', values: {} },
    { id: 'r-sh', label: 'Ширина плеч', values: {} },
    { id: 'r-ch', label: 'Обхват груди', values: {} },
  ],
};

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
  };
}

export default function ModelsBase() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

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
        pamyatka: '',
        photos: [],
        lekala: [],
        tabel_mer: DEFAULT_TABEL_MER,
      });
      setEditing(normalizeDraft(row));
    } catch (e) {
      message.error(e?.message || 'Не удалось создать');
    }
  };

  const openEdit = async (item) => {
    try {
      const row = await api.modelsBase.get(item.id);
      setEditing(normalizeDraft(row));
    } catch (e) {
      message.error(e?.message || 'Ошибка загрузки карточки');
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
      };
      const updated = await api.modelsBase.update(editing.id, payload);
      message.success('Сохранено');
      setEditing(normalizeDraft(updated));
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
          if (editing?.id === item.id) setEditing(null);
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
            value={record.values?.[s] ?? ''}
            onChange={(e) => updateTabelCell(index, s, e.target.value)}
            placeholder="—"
          />
        ),
      })),
      {
        title: '',
        key: 'del',
        width: 56,
        render: (_, __, index) => (
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeTabelRow(index)} />
        ),
      },
    ];
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
                    <Button
                      type="text"
                      danger
                      size="small"
                      className="!absolute -top-1 -right-1"
                      onClick={() => removeAsset('photos', i)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
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
            </div>
          ),
        },
        {
          key: 'tech',
          label: 'Техническое описание',
          children: (
            <TextArea
              rows={14}
              value={editing.technical_desc || ''}
              onChange={(e) => updateField('technical_desc', e.target.value)}
              placeholder="Описание конструкции, материалы, особенности…"
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
                    <Button type="text" danger size="small" className="!ml-2" onClick={() => removeAsset('lekala', i)}>
                      Удалить
                    </Button>
                  </div>
                ))}
              </div>
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
            </div>
          ),
        },
        {
          key: 'tabel',
          label: 'Табель мер',
          children: (
            <div className="space-y-3">
              <Button type="dashed" onClick={addTabelRow} icon={<PlusOutlined />}>
                Добавить строку
              </Button>
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
            <TextArea
              rows={14}
              value={editing.pamyatka || ''}
              onChange={(e) => updateField('pamyatka', e.target.value)}
              placeholder="Инструкция по пошиву…"
            />
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
              К списку
            </Button>
            <Space className="flex-1 flex-wrap">
              <Input
                className="max-w-[140px]"
                placeholder="Код"
                value={editing.code}
                onChange={(e) => updateField('code', e.target.value)}
              />
              <Input
                className="max-w-md flex-1 min-w-[200px]"
                placeholder="Название"
                value={editing.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveDraft}>
              Сохранить
            </Button>
          </div>
          <TextArea
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
                    <div className="mt-auto pt-3 flex gap-2">
                      <Button size="small" type="primary" onClick={() => openEdit(item)}>
                        Открыть
                      </Button>
                      <Button size="small" danger onClick={() => confirmDelete(item)}>
                        Удалить
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
