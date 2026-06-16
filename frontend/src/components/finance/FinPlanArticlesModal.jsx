import { useState, useEffect, useCallback } from 'react';
import { finplanApi, SOURCE_LABELS } from './financeApi';

const SOURCE_OPTIONS = [
  { value: 'manual', label: SOURCE_LABELS.manual },
  { value: 'planned_income', label: SOURCE_LABELS.planned_income },
  { value: 'planned_expense', label: SOURCE_LABELS.planned_expense },
];

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
}) {
  const allowedSources =
    category === 'revenue'
      ? SOURCE_OPTIONS.filter((s) => s.value !== 'planned_expense')
      : SOURCE_OPTIONS.filter((s) => s.value !== 'planned_income');

  const showLinkedSelect =
    article.source === 'planned_income' || article.source === 'planned_expense';
  const linkedOptions =
    article.source === 'planned_income'
      ? sourceArticles.planned_income
      : article.source === 'planned_expense'
        ? sourceArticles.planned_expense
        : [];

  const selectStyle = {
    width: '100%',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 6,
    padding: '6px 10px',
    color: '#94a3b8',
    fontSize: 12,
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
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== article.name) onUpdate(article.id, { name });
            }}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '6px 10px',
              color: '#e2e8f0',
              fontSize: 13,
              marginBottom: 8,
            }}
          />
          <select
            value={article.source}
            onChange={(e) => {
              const nextSource = e.target.value;
              const patch = { source: nextSource };
              if (nextSource === 'manual') {
                patch.linked_article_name = null;
              }
              onUpdate(article.id, patch);
            }}
            style={{ ...selectStyle, marginBottom: showLinkedSelect ? 8 : 0 }}
          >
            {allowedSources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {showLinkedSelect ? (
            <div>
              <div
                style={{
                  color: '#64748b',
                  fontSize: 10,
                  marginBottom: 4,
                }}
              >
                Привязать к конкретной статье (необязательно):
              </div>
              <select
                value={article.linked_article_name || ''}
                onChange={(e) =>
                  onUpdate(article.id, {
                    linked_article_name: e.target.value || null,
                  })
                }
                style={selectStyle}
              >
                <option value="">Все статьи источника (по умолчанию)</option>
                {linkedOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDelete(article.id)}
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
}) {
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

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
        />
      ))}
      <button
        type="button"
        onClick={() => onAdd(category)}
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

  const handleAdd = async (category) => {
    const name = category === 'revenue' ? 'Новая выручка' : 'Новый расход';
    const defaultSource = category === 'revenue' ? 'manual' : 'manual';
    setSaving(true);
    try {
      const row = await finplanApi.createArticle({
        name,
        category,
        source: defaultSource,
      });
      setArticles((prev) => [...prev, row]);
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
        orderedIds.map((id, idx) =>
          finplanApi.updateArticle(id, { sort_order: idx + 1 })
        )
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
