import React from 'react';
import path from 'path';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { parseContentToSegments as parseContent, formulaToSvgDataUri } from './render-katex';
import type { ContentSegment } from './render-katex';

const fontsDir = path.resolve(process.cwd(), 'lib', 'pdf', 'fonts');

Font.register({
  family: 'NotoSansSC',
  fonts: [
    {
      src: path.join(fontsDir, 'NotoSansSC-Regular.ttf'),
      fontWeight: 400,
    },
    {
      src: path.join(fontsDir, 'NotoSansSC-Bold.ttf'),
      fontWeight: 700,
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: '25mm 20mm 20mm 20mm',
    fontFamily: 'NotoSansSC',
    fontSize: 12,
    lineHeight: 1.8,
  },
  mainTitle: {
    marginBottom: 16,
    marginTop: 8,
  },
  mainTitleText: {
    fontSize: 24,
    fontWeight: 700,
    fontFamily: 'NotoSansSC',
  },
  subTitle: {
    marginBottom: 12,
    marginTop: 4,
  },
  subTitleText: {
    fontSize: 14,
    fontFamily: 'NotoSansSC',
    color: '#4a4a4a',
  },
  questionBlock: {
    marginBottom: 4,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  questionNumber: {
    width: 28,
    fontWeight: 700,
    fontSize: 12,
    marginTop: 1,
  },
  questionContent: {
    flex: 1,
    fontSize: 12,
    lineHeight: 1.8,
  },
  questionText: {
    fontSize: 12,
    lineHeight: 1.8,
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  blockFormula: {
    alignItems: 'center',
    marginVertical: 8,
  },
  contentImage: {
    maxWidth: '84mm',
    marginVertical: 6,
    objectFit: 'contain',
  },
  answerBlank: {
    height: '4cm',
    borderTop: '1pt dashed #d1d5db',
    marginTop: 8,
  },
  teacherBox: {
    marginTop: 12,
    marginLeft: 28,
    padding: 10,
    backgroundColor: '#f8fafc',
    border: '1pt solid #e2e8f0',
    borderRadius: 6,
  },
  teacherLabel: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
  },
  answerLabel: {
    color: '#dc2626',
    marginBottom: 2,
  },
  solutionLabel: {
    color: '#2563eb',
    marginTop: 8,
    marginBottom: 2,
  },
  teacherContent: {
    fontSize: 11,
    lineHeight: 1.6,
  },
  pageBreak: {
    height: 0,
  },
});

interface SimpleQuestion {
  id: string;
  content: string;
  answer?: string | null;
  solution?: string | null;
  type: string;
}

interface RenderBlock {
  id: string;
  type: 'MAIN_TITLE' | 'SUB_TITLE' | 'QUESTION' | 'PAGE_BREAK';
  content?: string;
  question?: SimpleQuestion;
  segments?: ContentSegment[];
}

interface ExamDocumentProps {
  blocks: RenderBlock[];
  mode: 'student' | 'teacher';
}

function QuestionContentRenderer({
  segments,
}: {
  segments: ContentSegment[];
}) {
  const inlineSegments = segments.filter(
    (s) =>
      s.type === 'text' || s.type === 'inline-formula' || s.type === 'image',
  );
  const blockFormulas = segments.filter((s) => s.type === 'block-formula');

  return (
    <View>
      {inlineSegments.length > 0 && (
        <View style={styles.inlineRow}>
          {inlineSegments.map((seg, i) => {
            if (seg.type === 'text') {
              return (
                <Text key={i} style={styles.questionText}>
                  {seg.content}
                </Text>
              );
            }
            if (seg.type === 'inline-formula') {
              const svgInfo = seg.dataUri && seg.width && seg.height
                ? { dataUri: seg.dataUri, width: seg.width, height: seg.height }
                : formulaToSvgDataUri(seg.content, false);
              const imgH = svgInfo.height > 0 ? Math.min(svgInfo.height * 0.9, 22) : 16;
              return (
                <Image
                  key={i}
                  src={svgInfo.dataUri}
                  style={{ height: imgH, marginHorizontal: 1 }}
                />
              );
            }
            if (seg.type === 'image' && seg.dataUri) {
              return (
                <Image key={i} src={seg.dataUri} style={styles.contentImage} />
              );
            }
            return null;
          })}
        </View>
      )}

      {blockFormulas.map((seg, i) => {
        const svgInfo = seg.dataUri && seg.width && seg.height
          ? { dataUri: seg.dataUri, width: seg.width, height: seg.height }
          : formulaToSvgDataUri(seg.content, true);
        const imgH = svgInfo.height > 0 ? Math.min(svgInfo.height * 0.9, 48) : 32;
        return (
          <View key={`bf-${i}`} style={styles.blockFormula}>
            <Image src={svgInfo.dataUri} style={{ height: imgH }} />
          </View>
        );
      })}
    </View>
  );
}

export function ExamDocument({ blocks, mode }: ExamDocumentProps) {
  const pageGroups: RenderBlock[][] = [];
  let currentGroup: RenderBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'PAGE_BREAK') {
      if (currentGroup.length > 0) {
        pageGroups.push(currentGroup);
        currentGroup = [];
      }
    } else {
      currentGroup.push(block);
    }
  }
  if (currentGroup.length > 0) {
    pageGroups.push(currentGroup);
  }

  let globalQuestionIndex = 0;

  return (
    <Document>
      {pageGroups.map((group, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          {group.map((block, blockIdx) => {
            if (block.type === 'MAIN_TITLE') {
              return (
                <View key={block.id} style={styles.mainTitle}>
                  <Text style={styles.mainTitleText}>
                    {block.content || ''}
                  </Text>
                </View>
              );
            }
            if (block.type === 'SUB_TITLE') {
              return (
                <View key={block.id} style={styles.subTitle}>
                  <Text style={styles.subTitleText}>
                    {block.content || ''}
                  </Text>
                </View>
              );
            }
            if (block.type === 'QUESTION' && block.question) {
              globalQuestionIndex++;
              const q = block.question;
              const segments = block.segments || parseContent(q.content);

              return (
                <View key={block.id} style={styles.questionBlock}>
                  <View style={styles.questionRow}>
                    <Text style={styles.questionNumber}>
                      {globalQuestionIndex}.
                    </Text>
                    <View style={styles.questionContent}>
                      <QuestionContentRenderer segments={segments} />
                    </View>
                  </View>

                  {mode === 'student' && <View style={styles.answerBlank} />}

                  {mode === 'teacher' && (
                    <View style={styles.teacherBox}>
                      <View>
                        <Text style={[styles.teacherLabel, styles.answerLabel]}>
                          答案
                        </Text>
                        <Text style={styles.teacherContent}>
                          {q.answer || '略'}
                        </Text>
                      </View>
                      {q.solution && (
                        <View>
                          <Text
                            style={[
                              styles.teacherLabel,
                              styles.solutionLabel,
                            ]}
                          >
                            解析
                          </Text>
                          <Text style={styles.teacherContent}>
                            {q.solution}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            }
            return null;
          })}
        </Page>
      ))}
    </Document>
  );
}
