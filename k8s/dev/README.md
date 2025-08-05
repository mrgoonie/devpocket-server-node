# DevPocket dev Environment Manifests

Generated on: Tue Aug  5 13:04:13 +07 2025
Environment: dev
Image: digitop/devpocket-nodejs:dev-latest
Version: latest

## Files

- `namespace.yaml` - Namespace definition
- `service.yaml` - Service definition
- `deployment.yaml` - Deployment definition
- `ingress.yaml` - Ingress definition

## Deployment

To deploy these manifests:

```bash
kubectl apply -f namespace.yaml
kubectl apply -f service.yaml
kubectl apply -f deployment.yaml
kubectl apply -f ingress.yaml
```

## Cleanup

To remove the deployment:

```bash
kubectl delete -f ingress.yaml
kubectl delete -f deployment.yaml
kubectl delete -f service.yaml
kubectl delete -f namespace.yaml
```
