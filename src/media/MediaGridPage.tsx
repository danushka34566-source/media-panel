import { ComponentProps } from 'react';
import MediaGridPageClient from './MediaGridPageClient';
import {
  htmlHasBrParagraphBreaks,
  safelyParseFormattedHtml,
} from '@/utility/html';
import { PAGE_ABOUT } from '@/app/config';

export default function MediaGridPage(
  props: ComponentProps<typeof MediaGridPageClient>,
) {
  const aboutTextSafelyParsedHtml = PAGE_ABOUT
    ? safelyParseFormattedHtml(PAGE_ABOUT)
    : undefined;
  const aboutTextHasBrParagraphBreaks = PAGE_ABOUT
    ? htmlHasBrParagraphBreaks(PAGE_ABOUT)
    : false;

  return <MediaGridPageClient {...{
    ...props,
    aboutTextSafelyParsedHtml,
    aboutTextHasBrParagraphBreaks,
  }} />;
}
