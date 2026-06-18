import { useState, useEffect, useCallback } from 'react';
import { finplanApi, SOURCE_LABELS } from './financeApi';

const SOURCE_OPTIONS = [
  { value: 'manual', label: SOURCE_LABELS.manual },
  { value: 'planned_income', label: SOURCE_LABELS.planned_income },
  { value: 'planned_expense', label: SOURCE_LABELS.planned_expense },
];

const selectStyle = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '6px 10px',
  color: '#94a3b8',
  fontSize: 12,
  boxSizing: 'border-box',
};

const inputStyle = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '6px 10px',
  color: '#e2e8f0',
  fontSize: 13,
  boxSizing: 'border-box',
};

function LinkedArticleField({ source, value, options, onChange, disabled }) {
  const [customMode, setCustomMode] = useState(false);
  const listId = `linked-${source}`;

  useEffect(() => {
    if (!value) {
      setCustomMode(false);
      return;
    }
    setCustomMode(!options.includes(value));
  }, [value, options]);

  if (source !== 'planned_income' && source !== 'planned_expense') {
    return null;
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: '#64748b', fontSize: 10, marginBottom: 4 }}>
        Привязка к статье планирования *
      </div>
      {!customMode ? (
        <select
          value={value || ''}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') {
              setCustomMode(true);
              onChange('');
              return;
            }
            onChange(v || null);
          }}
          style={selectStyle}
        >
          <option value="" disabled>
            — выберите статью —
          </option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="__custom__">+ Ввести новое значение…</option>
        </select>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            list={listId}
            value={value || ''}
            disabled={disabled}
            placeholder="Название статьи в планировании"
            onChange={(e) => onChange(e.target.value.trim() || null)}
            style={inputStyle}
          />
          <datalist id={listId}>
            {options.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCustomMode(false)}
            style={{
              background: '#1e2a3a',
              color: '#94a3b8',
              border: '1px solid #374151',
              borderRadius: 6,
              padding: '0 8px',
              cursor: 'pointer',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            Список
          </button>
        </div>
      )}
    </div>
  );
}

function ArticleRow({
  article,
  category,
  sourceArticles,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  saving,
}) {
  const allowedSources =
    category === 'revenue'
      ? SOURCE_OPTIONS.filter((s) => s.value !== 'planned_expense')
      : SOURCE_OPTIONS.filter((s) => s.value !== 'planned_income');

  const linkedOptions =
    article.source === 'planned_income'
      ? sourceArticles.planned_income
      : article.source === 'planned_expense'
        ? sourceArticles.planned_expense
        : [];

  const handleSourceChange = (nextSource) => {
    const patch = { source: nextSource };
    if (nextSource === 'manual') {
      patch.linked_article_name = null;
      onUpdate(article.id, patch);
      return;
    }
    const opts =
      nextSource === 'planned_income'
        ? sourceArticles.planned_income
        : sourceArticles.planned_expense;
    patch.linked_article_name = article.linked_article_name || opts[0] || null;
    onUpdate(article.id, patch);
  };

  const handleLinkedChange = (linkedName) => {
    if (!linkedName) return;
    onUpdate(article.id, { linked_article_name: linkedName });
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, article.id)}
      onDragOver={(e) => onDragOver(e, article.id)}
      onDrop={(e) => onDrop(e, article.id)}
      style={{
        background: isDragOver ? '#1e3a5f' : '#0a1628',
        border: '1px solid #1e3a5f',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: 'grab',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ color: '#475569', fontSize: 14, marginTop: 6 }}>⠿</span>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            defaultValue={article.name}
            disabled={saving}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== article.name) onUpdate(article.id, { name });
            }}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <select
            value={article.source}
            disabled={saving}
            onChange={(e) => handleSourceChange(e.target.value)}
            style={selectStyle}
          >
            {allowedSources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <LinkedArticleField
            source={article.source}
            value={article.linked_article_name}
            options={linkedOptions}
            disabled={saving}
            onChange={handleLinkedChange}
          />
          {article.source !== 'manual' && !article.linked_article_name ? (
            <div style={{ color: '#fbbf24', fontSize: 10, marginTop: 4 }}>
              Укажите привязку — без неё суммы из планирования не попадут в строку
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDelete(article.id)}
          disabled={saving}
          title="Удалить"
          style={{
            background: '#2a0a0a',
            color: '#f87171',
            border: '1px solid #f87171',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function AddArticleForm({ category, sourceArticles, saving, onSave, onCancel }) {
  const [name, setName] = useState(category === 'revenue' ? 'Новая выручка' : 'Новый расход');
  const [source, setSource] = useState('manual');
  const [linkedName, setLinkedName] = useState('');

  const linkedOptions =
    source === 'planned_income'
      ? sourceArticles.planned_income
      : source === 'planned_expense'
        ? sourceArticles.planned_expense
        : [];

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      alert('Укажите название статьи');
      return;
    }
    if (source !== 'manual' && !linkedName.trim()) {
      alert('Для автоматического источника выберите или введите привязку');
      return;
    }
    onSave({
      name: trimmed,
      category,
      source,
      linked_article_name: source === 'manual' ? null : linkedName.trim(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: '#0d1f35',
        border: '1px solid #2563eb',
        borderRadius: 8,
        padding: '12px',
        marginBottom: 8,
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название статьи"
        style={{ ...inputStyle, marginBottom: 8 }}
      />
      <select
        value={source}
        onChange={(e) => {
          const next = e.target.value;
          setSource(next);
          if (next === 'manual') {
            setLinkedName('');
          } else {
            const opts =
              next === 'planned_income'
                ? sourceArticles.planned_income
                : sourceArticles.planned_expense;
            setLinkedName(opts[0] || '');
          }
        }}
        style={{ ...selectStyle, marginBottom: 8 }}
      >
        {(category === 'revenue'
          ? SOURCE_OPTIONS.filter((s) => s.value !== 'planned_expense')
          : SOURCE_OPTIONS.filter((s) => s.value !== 'planned_income')
        ).map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <LinkedArticleField
        source={source}
        value={linkedName}
        options={linkedOptions}
        disabled={false}
        onChange={setLinkedName}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            flex: 1,
            background: '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Сохранить
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          style={{
            flex: 1,
            background: '#1e2a3a',
            color: '#94a3b8',
            border: '1px solid #374151',
            borderRadius: 6,
            padding: '8px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

function ArticleColumn({
  title,
  color,
  category,
  articles,
  sourceArticles,
  onUpdate,
  onDelete,
  onAdd,
  onReorder,
  saving,
  addDraftCategory,
  onStartAdd,
  onCancelAdd,
}) {
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const showAddForm = addDraftCategory === category;

  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const ids = articles.map((a) => a.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragId);
    onReorder(category, next);
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          color,
          fontWeight: 700,
          fontSize: 13,
          marginBottom: 12,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      {articles.map((a) => (
        <ArticleRow
          key={a.id}
          article={a}
          category={category}
          sourceArticles={sourceArticles}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          isDragOver={dragOverId === a.id}
          saving={saving}
        />
      ))}
      {showAddForm ? (
        <AddArticleForm
          category={category}
          sourceArticles={sourceArticles}
          saving={saving}
          onSave={onAdd}
          onCancel={onCancelAdd}
        />
      ) : (
        <button
          type="button"
          onClick={() => onStartAdd(category)}
          disabled={saving}
          style={{
            width: '100%',
            background: '#1e2a3a',
            color: '#94a3b8',
            border: '1px dashed #475569',
            borderRadius: 8,
            padding: '10px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {category === 'revenue' ? '+ Добавить статью выручки' : '+ Добавить статью расхода'}
        </button>
      )}
    </div>
  );
}

export default function FinPlanArticlesModal({ onClose, onChanged }) {
  const [articles, setArticles] = useState([]);
  const [sourceArticles, setSourceArticles] = useState({
    planned_income: [],
    planned_expense: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addDraftCategory, setAddDraftCategory] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, sources] = await Promise.all([
        finplanApi.listArticles(),
        finplanApi.getSourceArticles(),
      ]);
      setArticles(Array.isArray(rows) ? rows : []);
      setSourceArticles({
        planned_income: Array.isArray(sources?.planned_income) ? sources.planned_income : [],
        planned_expense: Array.isArray(sources?.planned_expense) ? sources.planned_expense : [],
      });
    } catch (err) {
      alert(err.message || 'Ошибка загрузки статей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revenue = articles
    .filter((a) => a.category === 'revenue')
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const expense = articles
    .filter((a) => a.category === 'expense')
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const handleUpdate = async (id, patch) => {
    setSaving(true);
    try {
      const updated = await finplanApi.updateArticle(id, patch);
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
      onChanged?.();
    } catch (err) {
      alert(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить статью?')) return;
    setSaving(true);
    try {
      await finplanApi.deleteArticle(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
      onChanged?.();
    } catch (err) {
      alert(err.message || 'Ошибка удаления');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (payload) => {
    setSaving(true);
    try {
      const row = await finplanApi.createArticle(payload);
      setArticles((prev) => [...prev, row]);
      setAddDraftCategory(null);
      onChanged?.();
    } catch (err) {
      alert(err.message || 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (category, orderedIds) => {
    setArticles((prev) => {
      const next = [...prev];
      orderedIds.forEach((id, idx) => {
        const i = next.findIndex((a) => a.id === id);
        if (i >= 0) next[i] = { ...next[i], sort_order: idx + 1 };
      });
      return next;
    });
    setSaving(true);
    try {
      await Promise.all(
        orderedIds.map((id, idx) => finplanApi.updateArticle(id, { sort_order: idx + 1 }))
      );
      onChanged?.();
    } catch (err) {
      alert(err.message || 'Ошибка сортировки');
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 1000,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          background: '#0f172a',
          border: '1px solid #1e3a5f',
          borderRadius: 14,
          padding: '24px',
          width: 720,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <div style={{ color: '#93c5fd', fontSize: 16, fontWeight: 700 }}>
            ⚙️ Управление статьями
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              color: '#64748b',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Загрузка...</div>
        ) : (
          <div style={{ display: 'flex', gap: 20 }}>
            <ArticleColumn
              title="Выручка"
              color="#4ade80"
              category="revenue"
              articles={revenue}
              sourceArticles={sourceArticles}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onAdd={handleAdd}
              onReorder={handleReorder}
              saving={saving}
              addDraftCategory={addDraftCategory}
              onStartAdd={setAddDraftCategory}
              onCancelAdd={() => setAddDraftCategory(null)}
            />
            <ArticleColumn
              title="Расходы"
              color="#f87171"
              category="expense"
              articles={expense}
              sourceArticles={sourceArticles}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onAdd={handleAdd}
              onReorder={handleReorder}
              saving={saving}
              addDraftCategory={addDraftCategory}
              onStartAdd={setAddDraftCategory}
              onCancelAdd={() => setAddDraftCategory(null)}
            />
          </div>
        )}

        {saving ? (
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 12, textAlign: 'center' }}>
            Сохранение...
          </div>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 20,
            width: '100%',
            background: '#1e2a3a',
            color: '#94a3b8',
            border: '1px solid #374151',
            borderRadius: 8,
            padding: '10px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Закрыть
        </button>
      </div>
    </>
  );
}
