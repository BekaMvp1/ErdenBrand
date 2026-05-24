/**
 * Печатный производственный бланк заказа (Раскрой / Пошив / ОТК)
 */

const TH = {
  border: '1px solid #000',
  padding: '3px 5px',
  background: '#f0f0f0',
  fontWeight: 700,
  fontSize: 10,
  textAlign: 'center',
};

const TD = {
  border: '1px solid #000',
  padding: '3px 5px',
  fontSize: 10,
  verticalAlign: 'middle',
};

const ALL_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52'];

const SIZE_LETTERS = {
  38: 'XXS',
  40: 'XS',
  42: 'S',
  44: 'M',
  46: 'L',
  48: 'XL',
  50: 'XXL',
  52: 'XXXL',
};

function safeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function resolvePhoto(order) {
  const photos = safeArray(order?.photos);
  const p = order?.photo || photos[0];
  if (!p) return null;
  if (typeof p === 'string') return p;
  if (typeof p === 'object' && p.url) return p.url;
  return null;
}

function resolveOps(order, stage) {
  const key =
    stage === 'cutting' ? 'cutting_ops' : stage === 'sewing' ? 'sewing_ops' : 'otk_ops';
  const direct = safeArray(order?.[key]);
  if (direct.length > 0) return direct;

  const ops = safeArray(order?.OrderOperations);
  return ops.filter((op) => {
    const cat = String(op.Operation?.category || '').toUpperCase();
    const n = String(op.Operation?.name || op.name || '').toLowerCase();
    if (stage === 'cutting') return cat === 'CUTTING' || /раскрой|cut/.test(n);
    if (stage === 'sewing') return cat === 'SEWING' || /пошив|sew/.test(n);
    if (stage === 'otk') return cat === 'FINISH' || /отк|qc|контрол/.test(n);
    return false;
  });
}

function resolveColors(order, fabricData) {
  const colors = [];
  fabricData.forEach((f) => {
    if (f.color && !colors.find((c) => c.name === f.color)) {
      colors.push({ name: f.color });
    }
  });
  if (colors.length === 0) {
    safeArray(order?.colors).forEach((c) => {
      const name = String(c || '').trim();
      if (name && !colors.find((x) => x.name === name)) colors.push({ name });
    });
  }
  safeArray(order?.sizes_colors).forEach((row) => {
    const name = String(row?.color || row?.name || '').trim();
    if (name && !colors.find((x) => x.name === name)) colors.push({ name });
  });
  return colors;
}

function materialNames(fabricData, fittingsData) {
  return [
    ...fabricData.map((f) => f.name || f.material_name),
    ...fittingsData.map((f) => f.name || f.material_name),
  ].filter(Boolean);
}

export default function PrintOrderBlank({ order }) {
  if (!order) return null;

  const stageLabel = 'ПРОИЗВОДСТВО';

  const fabricData = safeArray(order.fabric_data);
  const fittingsData = safeArray(order.fittings_data);
  const cuttingOps = resolveOps(order, 'cutting');
  const sewingOps = resolveOps(order, 'sewing');
  const otkOps = resolveOps(order, 'otk');
  const allOps = [
    ...cuttingOps.map((op) => ({ ...op, section: 'Раскрой' })),
    ...sewingOps.map((op) => ({ ...op, section: 'Пошив' })),
    ...otkOps.map((op) => ({ ...op, section: 'ОТК' })),
  ];
  const allSizes = ALL_SIZES;
  const colors = resolveColors(order, fabricData);
  const planFactMaterials = materialNames(fabricData, fittingsData);
  const photoSrc = resolvePhoto(order);
  const clientName = order.client_name || order.client?.name || order.Client?.name || '—';
  const orderQty = order.quantity ?? order.total_quantity ?? '';

  return (
    <div
      className="print-blank"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: 11,
        color: '#000',
        background: '#fff',
        padding: '10mm',
        maxWidth: '210mm',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          background: '#00bcd4',
          border: '2px solid #000',
          padding: '8px 12px',
          marginBottom: 0,
          fontSize: 11,
          fontWeight: 700,
          color: '#000',
          lineHeight: 1.5,
        }}
      >
        Внимание!!! Перед началом работ, обязательно внимательно изучить техническое задание, образец, наличие
        и количество всех деталей на образце и на раскладках. Технологи! Также изучить внимательно образец,
        все приложенные фото и табельмеры, так как могут возникнуть вопросы, которые можно решить перед
        запуском. Всегда из каждой партии прошивать по 1 размеру образцы, при необходимости линейку или 10ед.
        Мы одна команда, необходимо каждому из нас внимательно и своевременно выполнять свою функцию.
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000',
          marginBottom: 0,
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                ...TD,
                background: '#e0f7fa',
                fontWeight: 700,
                width: '25%',
              }}
            >
              Заказчик — {clientName}
            </td>
            <td
              style={{
                ...TD,
                background: '#e0f7fa',
                textAlign: 'center',
                width: '40%',
              }}
            >
              Дата: {new Date().toLocaleDateString('ru-RU')}
              &nbsp;&nbsp;
              {stageLabel}
            </td>
            <td
              style={{
                ...TD,
                background: '#e0f7fa',
                textAlign: 'right',
                fontWeight: 700,
                width: '35%',
              }}
            >
              ТЗ№ {order.number || order.tz_code || '—'}
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000',
          marginBottom: 0,
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                ...TD,
                width: '18%',
                verticalAlign: 'top',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 10,
                  marginBottom: 4,
                }}
              >
                {order.product_name || order.name || order.model_name || '—'}
              </div>
              {photoSrc ? (
                <img
                  src={photoSrc}
                  alt=""
                  style={{
                    width: '100%',
                    maxHeight: 120,
                    objectFit: 'contain',
                  }}
                />
              ) : null}
            </td>

            <td
              style={{
                ...TD,
                width: '42%',
                verticalAlign: 'top',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  textAlign: 'center',
                  borderBottom: '1px solid #000',
                  marginBottom: 4,
                  paddingBottom: 2,
                }}
              >
                Техническое задание
              </div>
              <div
                style={{
                  fontSize: 10,
                  lineHeight: 1.5,
                }}
              >
                {order.tech_description || order.description || order.comment || '—'}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                }}
              >
                <b>Дата отгрузки заказа:</b>{' '}
                {order.deadline || order.plan_date
                  ? new Date(order.deadline || order.plan_date).toLocaleDateString('ru-RU')
                  : '—'}
              </div>
            </td>

            <td
              style={{
                ...TD,
                width: '20%',
                verticalAlign: 'top',
                padding: 0,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  textAlign: 'center',
                  borderBottom: '1px solid #000',
                  padding: '3px',
                  background: '#f5f5f5',
                }}
              >
                План расход
              </div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                }}
              >
                <tbody>
                  {planFactMaterials.map((name, i) => (
                    <tr key={`plan-${i}`}>
                      <td
                        style={{
                          border: '1px solid #ccc',
                          padding: '2px 4px',
                          fontSize: 9,
                        }}
                      >
                        {name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>

            <td
              style={{
                ...TD,
                width: '20%',
                verticalAlign: 'top',
                padding: 0,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  textAlign: 'center',
                  borderBottom: '1px solid #000',
                  padding: '3px',
                  background: '#f5f5f5',
                }}
              >
                Факт расход
              </div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                }}
              >
                <tbody>
                  {planFactMaterials.map((name, i) => (
                    <tr key={`fact-${i}`}>
                      <td
                        style={{
                          border: '1px solid #ccc',
                          padding: '2px 4px',
                          fontSize: 9,
                          minHeight: 18,
                        }}
                      >
                        &nbsp;
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000',
          marginBottom: 0,
        }}
      >
        <thead>
          <tr>
            <td
              style={{
                ...TH,
                width: '15%',
              }}
            >
              Цвет / Артикул
            </td>
            <td
              style={{
                ...TH,
                width: '8%',
              }}
            >
              Кол-во заказа
            </td>
            {allSizes.map((s) => (
              <td
                key={s}
                style={{
                  ...TH,
                  background: ['42', '44', '46'].includes(s) ? '#ffff00' : '#fff',
                  width: '7%',
                }}
              >
                {s}
              </td>
            ))}
            <td
              style={{
                ...TH,
                width: '8%',
              }}
            >
              Кол-во по факту
            </td>
          </tr>
          <tr>
            <td style={TD} />
            <td style={TD} />
            {allSizes.map((s) => (
              <td
                key={`letter-${s}`}
                style={{
                  ...TD,
                  textAlign: 'center',
                  fontWeight: 700,
                  background: ['42', '44', '46'].includes(s) ? '#ffff00' : '#fff',
                  fontSize: 9,
                }}
              >
                {SIZE_LETTERS[s] || s}
              </td>
            ))}
            <td style={TD} />
          </tr>
        </thead>
        <tbody>
          {colors.length > 0 ? (
            colors.map((color, i) => (
              <tr key={i}>
                <td
                  style={{
                    ...TD,
                    fontWeight: 700,
                    fontSize: 10,
                  }}
                >
                  {color.name}
                </td>
                <td
                  style={{
                    ...TD,
                    textAlign: 'center',
                    fontWeight: 700,
                  }}
                >
                  {orderQty}
                </td>
                {allSizes.map((s) => (
                  <td
                    key={s}
                    style={{
                      ...TD,
                      textAlign: 'center',
                      background: ['42', '44', '46'].includes(s) ? '#fffde7' : '#fff',
                      minWidth: 28,
                      minHeight: 18,
                    }}
                  >
                    &nbsp;
                  </td>
                ))}
                <td
                  style={{
                    ...TD,
                    textAlign: 'center',
                  }}
                >
                  {orderQty}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td style={TD} />
              <td
                style={{
                  ...TD,
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              >
                {orderQty}
              </td>
              {allSizes.map((s) => (
                <td
                  key={s}
                  style={{
                    ...TD,
                    minHeight: 18,
                  }}
                >
                  &nbsp;
                </td>
              ))}
              <td style={TD}>&nbsp;</td>
            </tr>
          )}
          <tr style={{ background: '#ffff00' }}>
            <td
              style={{
                ...TD,
                fontWeight: 700,
              }}
            >
              ИТОГО
            </td>
            <td
              style={{
                ...TD,
                textAlign: 'center',
                fontWeight: 700,
              }}
            >
              {orderQty}
            </td>
            {allSizes.map((s) => (
              <td
                key={`total-${s}`}
                style={{
                  ...TD,
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              >
                &nbsp;
              </td>
            ))}
            <td
              style={{
                ...TD,
                textAlign: 'center',
                fontWeight: 700,
              }}
            >
              {orderQty}
            </td>
          </tr>
        </tbody>
      </table>

      {(fabricData.length > 0 || fittingsData.length > 0) && (
        <>
          <div
            style={{
              background: '#ffff00',
              border: '1px solid #000',
              padding: '3px 8px',
              fontWeight: 700,
              fontSize: 11,
              marginTop: 4,
            }}
          >
            Ткани и Фурнитура
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid #000',
            }}
          >
            <thead>
              <tr>
                <th style={TH}>№</th>
                <th style={TH}>Наименование</th>
                <th style={TH}>Тип</th>
                <th style={TH}>Цвет</th>
                <th style={TH}>Ед.</th>
                <th style={TH}>Норма/ед</th>
                <th style={TH}>Итого</th>
                <th style={TH}>Цена</th>
                <th style={TH}>Сумма</th>
                <th style={TH}>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {fabricData.length > 0 && (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      ...TD,
                      background: '#e3f2fd',
                      fontWeight: 700,
                      fontSize: 10,
                    }}
                  >
                    ТКАНЬ
                  </td>
                </tr>
              )}
              {fabricData.map((m, i) => {
                const norm = parseFloat(m.qty_per_unit || 0);
                const qty = parseFloat(order.quantity || order.total_quantity || 0);
                const price = parseFloat(m.price || 0);
                return (
                  <tr key={`fabric-${i}`}>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        width: 20,
                      }}
                    >
                      {i + 1}
                    </td>
                    <td style={TD}>{m.name || m.material_name}</td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      Ткань
                    </td>
                    <td style={TD}>{m.color || '—'}</td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      {m.unit || 'м'}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      {norm}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        fontWeight: 700,
                      }}
                    >
                      {(norm * qty).toFixed(1)}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'right',
                      }}
                    >
                      {price > 0 ? price : '—'}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'right',
                        fontWeight: 700,
                      }}
                    >
                      {price > 0 ? (norm * qty * price).toLocaleString('ru-RU') : '—'}
                    </td>
                    <td style={TD}>&nbsp;</td>
                  </tr>
                );
              })}

              {fittingsData.length > 0 && (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      ...TD,
                      background: '#fff9c4',
                      fontWeight: 700,
                      fontSize: 10,
                    }}
                  >
                    ФУРНИТУРА
                  </td>
                </tr>
              )}
              {fittingsData.map((m, i) => {
                const norm = parseFloat(m.qty_per_unit || 0);
                const qty = parseFloat(order.quantity || order.total_quantity || 0);
                const price = parseFloat(m.price || 0);
                return (
                  <tr key={`fitting-${i}`}>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      {i + 1}
                    </td>
                    <td style={TD}>{m.name || m.material_name}</td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      Фурнитура
                    </td>
                    <td style={TD}>{m.color || '—'}</td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      {m.unit || 'шт'}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      {norm}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        fontWeight: 700,
                      }}
                    >
                      {(norm * qty).toFixed(1)}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'right',
                      }}
                    >
                      {price > 0 ? price : '—'}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'right',
                        fontWeight: 700,
                      }}
                    >
                      {price > 0 ? (norm * qty * price).toLocaleString('ru-RU') : '—'}
                    </td>
                    <td style={TD}>&nbsp;</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div
        style={{
          background: '#ffff00',
          border: '1px solid #000',
          padding: '3px 8px',
          fontWeight: 700,
          fontSize: 11,
          marginTop: 4,
        }}
      >
        Наименование деталей кроя
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000',
        }}
      >
        <thead>
          <tr>
            <th style={TH}>Деталь (изделие 1)</th>
            <th style={TH}>Кол-во</th>
            <th style={TH}>Деталь (изделие 2)</th>
            <th style={TH}>Кол-во</th>
            <th style={TH}>Материал</th>
            <th style={TH}>Примечание</th>
          </tr>
        </thead>
        <tbody>
          {Array(8)
            .fill(0)
            .map((_, i) => (
              <tr key={i}>
                <td style={{ ...TD, minHeight: 18 }}>&nbsp;</td>
                <td
                  style={{
                    ...TD,
                    width: 40,
                    textAlign: 'center',
                  }}
                >
                  &nbsp;
                </td>
                <td style={TD}>&nbsp;</td>
                <td
                  style={{
                    ...TD,
                    width: 40,
                    textAlign: 'center',
                  }}
                >
                  &nbsp;
                </td>
                <td style={TD}>&nbsp;</td>
                <td style={TD}>&nbsp;</td>
              </tr>
            ))}
        </tbody>
      </table>

      <div
        style={{
          background: '#ffff00',
          border: '1px solid #000',
          borderTop: 'none',
          padding: '3px 8px',
          fontWeight: 700,
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        Описание модели
      </div>
      <div
        style={{
          border: '1px solid #000',
          borderTop: 'none',
          padding: '6px 8px',
          fontSize: 10,
          minHeight: 50,
          lineHeight: 1.6,
        }}
      >
        {order.tech_description || order.description || order.comment || '—'}
      </div>

      {allOps.length > 0 && (
        <>
          <div
            style={{
              background: '#ffff00',
              border: '1px solid #000',
              borderTop: 'none',
              padding: '3px 8px',
              fontWeight: 700,
              fontSize: 11,
              textAlign: 'center',
            }}
          >
            Техническая последовательность — {stageLabel}
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid #000',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...TH, width: 30 }}>№</th>
                <th style={{ ...TH, width: 70 }}>Раздел</th>
                <th style={TH}>Операция</th>
                <th style={{ ...TH, width: 80 }}>Норма (мин)</th>
                <th style={{ ...TH, width: 80 }}>Расценка (сом)</th>
                <th style={{ ...TH, width: 90 }}>ЗП итого</th>
              </tr>
            </thead>
            <tbody>
              {allOps.map((op, i) => {
                const price = parseFloat(op.price || op.cost || 0);
                const qty = parseFloat(order.quantity || order.total_quantity || 0);
                return (
                  <tr key={i}>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      {i + 1}
                    </td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{op.section}</td>
                    <td style={TD}>{op.name || op.operation_name || op.Operation?.name || '—'}</td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                      }}
                    >
                      {op.time || op.norm || '—'}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'right',
                      }}
                    >
                      {price > 0 ? `${price} сом/шт` : '—'}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'right',
                        fontWeight: 700,
                      }}
                    >
                      {price > 0 ? `${(price * qty).toLocaleString('ru-RU')} сом` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div
        style={{
          background: '#ffff00',
          border: '1px solid #000',
          borderTop: 'none',
          padding: '3px 8px',
          fontWeight: 700,
          fontSize: 11,
          textAlign: 'center',
          marginTop: 4,
        }}
      >
        Контроль качества готовых изделий
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000',
        }}
      >
        <tbody>
          {[
            'Изделие чистое, отутюженное, без пятен, затяжек и повреждений',
            'Цвет деталей одинаковый, без разнотона',
            'Полотно без перекосов и деформации',
            'Симметрия правой и левой сторон соблюдена',
            'Линии низа и рукавов горизонтальны',
            'Ширина пояса стабильная +- 2мм',
            'Резинка не перекручена',
            'Равномерная сборка',
            'Отсутствие защипов',
            'Строчка параллельно сгибу',
            'Эластичность без обрыва нитей',
          ].map((item, i) => (
            <tr key={i}>
              <td
                style={{
                  ...TD,
                  width: 20,
                  textAlign: 'center',
                }}
              >
                □
              </td>
              <td
                style={{
                  ...TD,
                  fontWeight: i < 3 ? 700 : 400,
                }}
              >
                {item}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          border: '1px solid #000',
          borderTop: 'none',
          padding: '3px 8px',
          fontWeight: 700,
          fontSize: 11,
        }}
      >
        Табель мер
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000',
        }}
      >
        <thead>
          <tr>
            <td
              style={{
                ...TH,
                background: '#ff6b6b',
                color: '#fff',
                width: '25%',
              }}
            >
              Параметр / {order.number || order.tz_code || '—'}
            </td>
            {['42', '44', '46', '48'].map((s) => (
              <td
                key={s}
                style={{
                  ...TH,
                  background: '#ffff00',
                  width: '10%',
                }}
              >
                {s}
              </td>
            ))}
            <td style={{ ...TH, width: '15%' }}>Допуск</td>
            <td style={{ ...TH, width: '20%' }}>Примечание</td>
          </tr>
        </thead>
        <tbody>
          {[
            { name: 'Полуобхват груди', tol: '+/- 0,5' },
            { name: 'Полуобхват бедер', tol: '+/- 0,5' },
            { name: 'Длина изделия по спинке', tol: '+/- 1' },
            { name: 'Длина рукава', tol: '+/- 1' },
            { name: 'Ширина плеча', tol: '+/- 0,2' },
            { name: 'Полуобхват талии', tol: '+/- 0,5' },
            { name: 'Длина брюк с поясом', tol: '+/- 1' },
          ].map((row, i) => (
            <tr key={i}>
              <td style={TD}>{row.name}</td>
              {['42', '44', '46', '48'].map((s) => (
                <td
                  key={s}
                  style={{
                    ...TD,
                    textAlign: 'center',
                    background: '#fffde7',
                    minWidth: 32,
                  }}
                >
                  &nbsp;
                </td>
              ))}
              <td
                style={{
                  ...TD,
                  textAlign: 'center',
                }}
              >
                {row.tol}
              </td>
              <td style={TD}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          background: '#00bcd4',
          border: '1px solid #000',
          borderTop: 'none',
          padding: '3px 8px',
          fontWeight: 700,
          fontSize: 11,
          marginTop: 4,
        }}
      >
        ПАМЯТКА
      </div>
      <div
        style={{
          border: '1px solid #000',
          borderTop: 'none',
          padding: '8px',
          fontSize: 10,
          minHeight: 40,
          lineHeight: 1.6,
        }}
      >
        {order.pamyatka || order.notes || '—'}
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000',
          marginTop: 8,
        }}
      >
        <tbody>
          <tr>
            {['Технолог', 'Раскройщик', 'Мастер пошива', 'ОТК', 'Менеджер'].map((role) => (
              <td
                key={role}
                style={{
                  ...TD,
                  textAlign: 'center',
                  width: '20%',
                  height: 40,
                }}
              >
                <div
                  style={{
                    borderBottom: '1px solid #000',
                    marginBottom: 4,
                    height: 24,
                  }}
                />
                <div style={{ fontSize: 9 }}>{role}</div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
