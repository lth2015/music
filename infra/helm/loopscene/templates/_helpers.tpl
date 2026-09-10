{{- define "loopscene.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "loopscene.labels" -}}
app.kubernetes.io/name: {{ include "loopscene.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Image references are digest-pinned. A mutable tag would make "roll back to the
previous release" ambiguous, so the chart fails rather than deploying one.
*/}}
{{- define "loopscene.apiImage" -}}
{{- if not .Values.image.api.digest -}}
{{- fail "image.api.digest is required: images must be pinned by digest, not tag" -}}
{{- end -}}
{{ .Values.image.registry }}/{{ .Values.image.api.repository }}@{{ .Values.image.api.digest }}
{{- end -}}

{{- define "loopscene.workerImage" -}}
{{- if not .Values.image.worker.digest -}}
{{- fail "image.worker.digest is required: images must be pinned by digest, not tag" -}}
{{- end -}}
{{ .Values.image.registry }}/{{ .Values.image.worker.repository }}@{{ .Values.image.worker.digest }}
{{- end -}}

{{/*
Shared environment, split into the two keys a container spec expects.
Secrets come exclusively from `envFromSecret`; nothing sensitive is rendered
into the ConfigMap or into Helm release history (SEC-06).
*/}}
{{- define "loopscene.envVars" -}}
- name: RUN_MODE
  value: {{ .Values.runMode | quote }}
- name: NODE_ENV
  value: "production"
{{- end -}}

{{- define "loopscene.envFrom" -}}
- configMapRef:
    name: {{ include "loopscene.name" . }}-config
- secretRef:
    name: {{ .Values.envFromSecret }}
{{- end -}}
