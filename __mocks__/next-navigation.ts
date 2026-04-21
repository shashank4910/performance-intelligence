const replace = jest.fn();
const push = jest.fn();
const useRouter = () => ({ replace, push });
const useParams = () => ({});
export { useRouter, useParams, replace, push };
