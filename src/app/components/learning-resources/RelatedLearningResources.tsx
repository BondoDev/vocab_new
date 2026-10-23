import { Link } from "react-router-dom";
import { useLanguage } from "../../../contexts/LanguageContext";
import { getSeoHubPath } from "../../../data/seo/shared/hub";
import type { TargetLanguageSlug, UiLanguageCode } from "../../../data/seo/shared/slugs";
import { getRelatedLearningResources } from "./learningResourcesRegistry";

interface RelatedLearningResourcesProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  currentPath: string;
}

// Same-language resource links for pages that have no authored "related"
// section of their own. Pages with an authored section append
// getRelatedLearningResources() items to it instead of rendering this.
export function RelatedLearningResources({
  uiLang,
  targetLanguage,
  currentPath,
}: RelatedLearningResourcesProps) {
  const { t } = useLanguage();
  const links = getRelatedLearningResources(uiLang, targetLanguage, [currentPath]);

  return (
    <section aria-labelledby="related-learning-resources-heading" className="border-t border-border pt-6">
      <h2 id="related-learning-resources-heading" className="text-lg font-semibold text-foreground">
        {t("learningResources.label")}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.kind}>
            <Link
              className="inline-flex rounded-lg border border-primary/30 px-3 py-1.5 text-sm text-primary transition hover:bg-primary/10"
              to={link.href}
            >
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <Link
            className="inline-flex px-1 py-1.5 text-sm text-primary underline-offset-4 transition hover:underline"
            to={getSeoHubPath(uiLang)}
          >
            {t("learningResources.browse")}
          </Link>
        </li>
      </ul>
    </section>
  );
}
