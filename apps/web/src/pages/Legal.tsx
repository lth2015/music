import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useSession } from '../lib/session';
import { Loading } from '../components/common';

interface Disclosure {
  configured: boolean;
  isPlaceholder: boolean;
  entityName: string;
  representative: string;
  address: string;
  contact: string;
  phone: string;
  notice: string | null;
}

/**
 * SEC-13: legal pages.
 *
 * Every page here carries an explicit banner while the content is a draft.
 * PROJECT_TASK.md is unambiguous that placeholder text is fine for a demo and
 * must never survive into real selling, so the banner is driven by the server's
 * disclosure state rather than by a constant someone could forget to flip.
 */
function DraftBanner({ isPlaceholder }: { isPlaceholder: boolean }) {
  if (!isPlaceholder) return null;
  return (
    <div className="alert alert--warn">
      <div className="alert__title">これは未確定の草案です</div>
      <div className="small">
        日本の弁護士によるレビューを受けていません。実際の課金を開始する前に、
        経営主体の情報とあわせて確定版に差し替える必要があります。
      </div>
    </div>
  );
}

function useDisclosure() {
  const [disclosure, setDisclosure] = useState<Disclosure | null>(null);
  useEffect(() => {
    void apiFetch<Disclosure>('/v1/legal/business-disclosure')
      .then(setDisclosure)
      .catch(() => setDisclosure(null));
  }, []);
  return disclosure;
}

export function Tokushoho() {
  const disclosure = useDisclosure();
  if (!disclosure) return <Loading />;

  const rows: Array<[string, string]> = [
    ['販売事業者', disclosure.entityName],
    ['運営責任者', disclosure.representative],
    ['所在地', disclosure.address],
    ['連絡先', disclosure.contact],
    ['電話番号', disclosure.phone],
    ['販売価格', '各商品ページに税込価格で表示します（DROP 980円 / CREATOR 月額1,980円）'],
    ['商品代金以外の必要料金', 'インターネット接続に必要な通信料はお客様のご負担となります'],
    ['お支払い方法', 'クレジットカード（決済代行：Stripe）'],
    ['お支払い時期', 'お申し込み時。月額プランは毎月の請求日に自動で決済されます'],
    ['提供時期', 'お支払いの確認後ただちに生成回数がアカウントへ反映されます'],
    [
      '返品・キャンセル',
      'デジタルサービスの性質上、原則として消費後の返金はいたしかねます。' +
        '技術的な失敗により消費された回数は返却します。誤課金は原状回復します。' +
        '未使用かつ購入後7日以内のお申し出は個別にご案内します。法令に基づく権利を制限するものではありません。',
    ],
    ['解約方法', '「請求」ページからオンラインで自動更新を停止できます。お電話での手続きは不要です'],
    ['動作環境', '最新版のモバイル/デスクトップブラウザ。音声再生に対応した環境が必要です'],
  ];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }} className="stack stack--loose">
      <h1 style={{ fontSize: 26 }}>特定商取引法に基づく表記</h1>
      <DraftBanner isPlaceholder={disclosure.isPlaceholder} />
      {disclosure.notice && <div className="alert alert--warn small">{disclosure.notice}</div>}

      <div className="table-wrap">
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th style={{ width: '30%' }}>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Terms() {
  const disclosure = useDisclosure();
  const { runtime } = useSession();

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }} className="stack stack--loose">
      <h1 style={{ fontSize: 26 }}>利用規約</h1>
      <DraftBanner isPlaceholder={disclosure?.isPlaceholder ?? true} />

      <section className="stack">
        <h2>1. サービスの内容</h2>
        <p className="muted">
          本サービスは、お客様が入力したシーンと気分の説明をもとに、30秒のインストゥルメンタル
          （歌詞・ボーカルなし）BGMを生成し、試聴・切り出し・ダウンロードを提供するものです。
          歌詞、ボーカル、既存楽曲のカバー、参考音源のアップロードには対応していません。
        </p>

        <h2>2. ご利用の条件</h2>
        <p className="muted">
          本サービスの生成および購入は、日本国内にお住まいの18歳以上の個人の方を対象としています。
        </p>

        <h2>3. 生成回数について</h2>
        <ul className="muted">
          <li>1回の消費は、技術的に正常に納品された30秒音源1件に対応します</li>
          <li>試聴、切り出し、既存ファイルの再ダウンロードでは消費されません</li>
          <li>技術的な失敗、供給元による拒否、当社の出力審査の不通過では消費されません</li>
          <li>生成結果がお好みに合わないことは技術的な失敗にはあたらず、再生成には別途1回を消費します</li>
          <li>回数は譲渡・換金できません</li>
        </ul>

        <h2>4. 生成物の利用範囲</h2>
        <p className="muted">
          お客様が生成した音源について許諾される利用範囲は、生成時点の「利用条件記録」に記載された内容に従います。
          利用条件記録は当社の利用条件と生成元情報を示すものであり、著作権登録、権利者証明、
          独占的所有権、または非侵害の保証ではありません。
        </p>
        {runtime && !runtime.features.commercialDeliveryEnabled && (
          <div className="alert alert--warn small">
            現時点では、供給元との商用利用に関する契約が締結されていないため、
            付与される利用範囲は動作確認の目的に限定されます。
          </div>
        )}

        <h2>5. 禁止事項</h2>
        <ul className="muted">
          <li>アーティスト名・楽曲名・既存の歌詞を指定した生成の試み</li>
          <li>実在する人物の声や歌唱の再現、公認・提携を装う表示</li>
          <li>生成音源単体の再販売、素材ライブラリへの登録、第三者への再許諾</li>
          <li>音楽配信サービスへの配信、Content ID等における排他的な権利主張</li>
          <li>本サービスの技術的保護手段の回避、過度な自動化アクセス</li>
        </ul>

        <h2>6. 免責</h2>
        <p className="muted">
          当社は、入力の事前確認、供給元の安全フィルタ、出力の技術的検査を実施しますが、
          これらはリスクを低減するための措置であり、生成物が第三者の権利を侵害しないことを保証するものではありません。
          お客様の公開先プラットフォームの規約への適合は、お客様ご自身でご確認ください。
        </p>

        <h2>7. サービスの変更・終了</h2>
        <p className="muted">
          当社は、事前の告知のうえ本サービスの内容を変更または終了することがあります。
          その場合も、すでに適法に取得された既存音源の利用条件は、生成時点の条件に従って取り扱われることを目指します
          （供給元との契約に当該条項が含まれることを前提とします）。
        </p>

        <h2>8. お問い合わせ</h2>
        <p className="muted">
          {disclosure?.contact ?? '（未設定）'} / 権利に関するお申し立ては{' '}
          <Link to="/help/rights">こちら</Link> から受け付けています。
        </p>
      </section>
    </div>
  );
}

export function Privacy() {
  const disclosure = useDisclosure();
  const { runtime } = useSession();

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }} className="stack stack--loose">
      <h1 style={{ fontSize: 26 }}>プライバシーポリシー</h1>
      <DraftBanner isPlaceholder={disclosure?.isPlaceholder ?? true} />

      <section className="stack">
        <h2>取得する情報</h2>
        <ul className="muted">
          <li>メールアドレス（ログインと重要なお知らせのため）</li>
          <li>生成のために入力されたシーン・気分の説明、および生成された音源</li>
          <li>注文・支払い・返金の記録（カード番号は取得しません）</li>
          <li>サービス改善のための利用状況（識別子は仮名化して扱います）</li>
        </ul>

        <h2>第三者への提供と委託</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>提供先</th>
                <th>目的</th>
                <th>渡す情報</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>TokenStars（テキストモデル）</td>
                <td>入力文からの生成パラメータ整理</td>
                <td className="small">
                  シーン・気分の説明と数値パラメータのみ。メールアドレス、支払い情報、
                  本人確認資料は渡しません。
                </td>
              </tr>
              <tr>
                <td>音楽生成の供給元</td>
                <td>音源の生成</td>
                <td className="small">
                  整理後の生成パラメータのみ。
                  {runtime?.demo
                    ? '現在のデモ環境では外部への送信は行っていません。'
                    : ''}
                </td>
              </tr>
              <tr>
                <td>Stripe</td>
                <td>クレジットカード決済の処理</td>
                <td className="small">
                  お支払いに必要な情報。カード番号は当社を経由せず、Stripeが直接取得します。
                </td>
              </tr>
              <tr>
                <td>Amazon Web Services</td>
                <td>認証・保管・配信基盤</td>
                <td className="small">アカウント情報、音源、運用ログ</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">
          一部の委託先は日本国外で情報を取り扱う場合があります。主たる保管を東京リージョンで行うことは、
          すべての処理が日本国内で完結することを意味しません。
          外国にある第三者への提供にあたっては、個人情報保護法に定める手続きに従います。
        </p>

        <h2>保存期間</h2>
        <ul className="muted">
          <li>アカウント情報・生成音源：アカウントの削除まで</li>
          <li>取引記録：関係法令に定める期間</li>
          <li>権利申立に関する資料：調査の終了および紛争の解決まで</li>
        </ul>

        <h2>お客様の操作</h2>
        <p className="muted">
          「自動更新の停止」「お知らせメールの配信停止」「アカウントの削除」は、それぞれ独立した操作です。
          アカウントを削除しても、法令上の保存義務がある取引記録および係争中の証拠は、
          必要な範囲で分離して保管されます。
        </p>

        <h2>お問い合わせ</h2>
        <p className="muted">{disclosure?.contact ?? '（未設定）'}</p>
      </section>
    </div>
  );
}
