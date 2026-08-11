import {
  ReactNode,
  useEffect,
  useRef,
} from 'react';

export default function AnchorSections({
  sections,
  className,
  classNameSection,
  onSectionChange,
}: {
  sections: {
    id: string
    content: ReactNode
  }[]
  className?: string
  classNameSection?: string
  onSectionChange?: (section: string) => void
}) {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentSectionRef = useRef('');

  useEffect(() => {
    const updateCurrentSection = () => {
      if (sections.length === 0) { return; }

      const scrollBottom = window.scrollY + window.innerHeight;
      const documentBottom = document.documentElement.scrollHeight;
      if (documentBottom - scrollBottom <= 80) {
        const lastSectionId = sections[sections.length - 1]?.id;
        if (lastSectionId && lastSectionId !== currentSectionRef.current) {
          currentSectionRef.current = lastSectionId;
          onSectionChange?.(lastSectionId);
        }
        return;
      }

      let activeSection = sections[0]?.id;
      const activationTop = 140;

      sections.forEach(({ id }) => {
        const element = sectionRefs.current[id];
        if (!element) { return; }
        const rect = element.getBoundingClientRect();
        if (rect.top <= activationTop) {
          activeSection = id;
        }
      });

      if (activeSection && activeSection !== currentSectionRef.current) {
        currentSectionRef.current = activeSection;
        onSectionChange?.(activeSection);
      }
    };

    updateCurrentSection();
    window.addEventListener('scroll', updateCurrentSection, { passive: true });
    window.addEventListener('resize', updateCurrentSection);

    return () => {
      window.removeEventListener('scroll', updateCurrentSection);
      window.removeEventListener('resize', updateCurrentSection);
    };
  }, [onSectionChange, sections]);

  return (
    <div className={className}>
      {sections.map(({ id, content }) => (
        <div
          key={id}
          ref={element => {
            sectionRefs.current[id] = element;
          }}
          {...{ id, className: classNameSection }}
        >
          {content}
        </div>
      ))}
    </div>
  );
}
