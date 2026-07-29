import React from 'react';
import { ChevronRight } from 'lucide-react';
import { DISORDER_CATEGORY_ORDER } from '../../app/navigation.js';

export function DisorderIndex({ items, selected, onSelect }) {
  const groups = items.reduce((result, item) => {
    const name = item.category || '待分类';
    const group = result.find((entry) => entry.name === name);
    if (group) group.items.push(item);
    else result.push({ name, items: [item] });
    return result;
  }, []);
  groups.sort((a, b) => {
    const ai = DISORDER_CATEGORY_ORDER.indexOf(a.name);
    const bi = DISORDER_CATEGORY_ORDER.indexOf(b.name);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN');
  });
  return (
    <div className="disorder-index">
      {groups.map((group) => (
        <section className="disorder-category" key={group.name}>
          <div className="disorder-category-head"><strong>{group.name}</strong><small>{group.items.length}</small></div>
          <div className="index-list">
            {group.items.map((item) => (
              <button
                key={item.id}
                className={selected?.id === item.id ? 'selected' : ''}
                onClick={() => onSelect(item)}
              >
                <span>{item.name}</span>
                <small>{item.aliases?.join(' · ')}</small>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DrugIndex({ items, selected, onSelect }) {
  const sections = [];
  items.forEach((item) => {
    const sectionName = item.section || '待补充章节';
    let section = sections.find((entry) => entry.name === sectionName);
    if (!section) {
      section = { name: sectionName, order: item.classOrder || 999, categories: [] };
      sections.push(section);
    }
    const categoryLabel = item.categoryLabel || item.className || '待补充分类';
    let category = section.categories.find((entry) => entry.name === categoryLabel);
    if (!category) {
      category = {
        name: categoryLabel,
        description: item.className,
        order: item.classOrder || 999,
        items: []
      };
      section.categories.push(category);
    }
    category.items.push(item);
  });
  sections.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
  sections.forEach((section) =>
    section.categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))
  );

  return (
    <div className="drug-index">
      {sections.map((section) => (
        <section className="drug-section" key={section.name}>
          <div className="drug-section-head">
            <strong>{section.name}</strong>
            <span>{section.categories.reduce((total, category) => total + category.items.length, 0)} 个词条</span>
          </div>
          {section.categories.map((category) => (
            <div className="drug-category" key={category.name}>
              <div className="drug-category-head">
                <div>
                  <strong>{category.name}</strong>
                  {category.description && category.description !== category.name && <span>{category.description}</span>}
                </div>
                <small>{category.items.length}</small>
              </div>
              <div className="index-list">
                {category.items.map((item) => (
                  <button
                    key={item.id}
                    className={selected?.id === item.id ? 'selected' : ''}
                    onClick={() => onSelect(item)}
                  >
                    <span>{item.name}</span>
                    <small>{item.aliases}</small>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
