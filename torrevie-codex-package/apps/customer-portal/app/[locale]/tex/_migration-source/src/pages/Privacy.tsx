const Privacy = () => (
  <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="border-b border-border pb-6">
        <p className="text-sm font-medium text-primary">Torrevie TEX</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal">Privacy Policy</h1>
        <p className="mt-3 text-muted-foreground">Last updated: 11 July 2026</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="leading-7 text-muted-foreground">
          Torrevie TEX is an internal transport expense management platform used to receive,
          review, approve, and settle employee expense submissions and receipt images.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Information We Process</h2>
        <p className="leading-7 text-muted-foreground">
          The platform may process user account details, company and employee records, phone
          numbers, trip details, expense amounts, receipt images, OCR results, approval activity,
          and notification delivery records needed to operate the service.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">How We Use Information</h2>
        <p className="leading-7 text-muted-foreground">
          Information is used to authenticate users, route WhatsApp receipt submissions, extract
          receipt details, manage approvals, calculate settlements, provide audit trails, and send
          operational notifications related to expense processing.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Service Providers</h2>
        <p className="leading-7 text-muted-foreground">
          TEX uses trusted infrastructure and messaging providers, including hosting, database,
          email, OCR, storage, and WhatsApp Business Platform services, only as required to deliver
          the platform.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Data Access and Retention</h2>
        <p className="leading-7 text-muted-foreground">
          Access is limited to authorized users based on their role and company membership. Records
          are retained for operational, accounting, audit, and compliance needs unless deletion is
          required by an authorized company administrator or applicable law.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="leading-7 text-muted-foreground">
          For privacy questions or access requests, contact Torrevie at{" "}
          <a className="font-medium text-primary underline-offset-4 hover:underline" href="mailto:semaan@torrevie.com">
            semaan@torrevie.com
          </a>
          .
        </p>
      </section>
    </div>
  </main>
);

export default Privacy;
